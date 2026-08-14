"""The knowledge base: what doctors at this hospital have actually approved.

One row per doctor-approved consultation — the symptoms, the assistive
diagnosis, and the exact medicines the treating doctor signed off. When a
later patient presents similarly, these are retrieved and shown to the model
as precedent, so its suggestion is grounded in a decision a doctor already
made here rather than invented from scratch.

Two properties this table has to hold, and why:

*Approved only.* A row exists exactly while the source consultation's
prescription is verified. Withdraw the sign-off and the row is retired, so an
unreviewed prescription can never become the basis of a future suggestion.

*De-identified.* Nothing here names the patient it came from. Precedents are
read during a *different* patient's consultation and are sent to an external
model, so they carry only clinical content plus coarse demographics. The link
back to the source consultation is kept for the audit trail, and is never sent
anywhere or shown alongside a suggestion.
"""

import json
import struct
from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


def pack_embedding(values):
    """Stores a vector as packed float32 rather than JSON.

    A retrieval scans every active precedent, so this is the hot path as the
    knowledge base grows: packed floats are about a fifth the size of the JSON
    text and unpack without parsing. Vectors are stored pre-normalised (see
    `normalise`), which lets similarity be a plain dot product.
    """
    if not values:
        return None
    return struct.pack(f"<{len(values)}f", *values)


def unpack_embedding(blob):
    if not blob:
        return None
    return list(struct.unpack(f"<{len(blob) // 4}f", blob))


def normalise(values):
    """Scales a vector to unit length, so cosine similarity is a dot product.

    Returns it unchanged if the magnitude is zero — a degenerate embedding is
    something to skip at match time, not to divide by here.
    """
    magnitude = sum(v * v for v in values) ** 0.5
    if not magnitude:
        return list(values)
    return [v / magnitude for v in values]


class ClinicalPrecedent(db.Model):
    __tablename__ = "clinical_precedents"

    id = db.Column(db.Integer, primary_key=True)
    # The approved consultation this was learned from. Unique: one consultation
    # contributes one precedent, and re-approving refreshes it in place rather
    # than teaching the same case twice.
    source_consultation_id = db.Column(
        db.Integer, db.ForeignKey("consultations.id"), nullable=False, unique=True
    )
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)

    # --- The clinical content, which is what gets matched and shown ---------
    symptoms = db.Column(db.Text, nullable=True)
    diagnosis = db.Column(db.Text, nullable=True)
    # The signed-off medicines, frozen as JSON at the moment of approval:
    # [{"medicine_name", "dose", "frequency", "duration"}, ...]
    #
    # Deliberately a snapshot rather than a join to generated_prescriptions.
    # A precedent must record what was approved, and stay that way even if the
    # source consultation is later unlocked and edited.
    medicines = db.Column(db.Text, nullable=False, default="[]")

    # --- De-identified context ---------------------------------------------
    # Banded rather than exact: age is enough to judge whether a precedent
    # applies, and a date of birth alongside a diagnosis is identifying.
    age_band = db.Column(db.String(16), nullable=True)
    gender = db.Column(db.String(10), nullable=True)

    # --- Matching ----------------------------------------------------------
    embedding = db.Column(db.LargeBinary, nullable=True)
    embedding_model = db.Column(db.String(80), nullable=True)
    # What was embedded, kept so a change of embedding model can re-embed the
    # whole table without reconstructing the text from its parts.
    embedding_text = db.Column(db.Text, nullable=True)

    # --- How well it's serving ---------------------------------------------
    times_suggested = db.Column(db.Integer, nullable=False, default=0)
    # Incremented when a doctor approves a prescription that kept medicines
    # this precedent suggested — the signal that it is genuinely useful and
    # not just similar-looking.
    times_accepted = db.Column(db.Integer, nullable=False, default=0)

    approved_at = db.Column(db.DateTime, nullable=True)
    # Set when the source prescription's sign-off is withdrawn. Retired rows
    # are skipped by retrieval but kept, so the audit trail still shows what
    # the knowledge base contained at any point.
    # Indexed (added via a raw migration, not this flag originally — declared
    # here too so `flask db migrate` sees it and stops proposing to drop it).
    retired_at = db.Column(db.DateTime, nullable=True, index=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    source_consultation = db.relationship("Consultation")
    doctor = db.relationship("Doctor")
    department = db.relationship("Department")

    @property
    def is_active(self):
        return self.retired_at is None

    @property
    def medicine_list(self):
        try:
            return json.loads(self.medicines or "[]")
        except (TypeError, ValueError):
            return []

    @property
    def vector(self):
        return unpack_embedding(self.embedding)

    def set_embedding(self, values, model_name, source_text):
        """Stores a vector normalised, so matching is a dot product."""
        self.embedding = pack_embedding(normalise(values)) if values else None
        self.embedding_model = model_name
        self.embedding_text = source_text

    def for_model(self, similarity=None):
        """The shape sent to the AI as precedent.

        Carries no patient identity and no source consultation — the model is
        being asked to judge a clinical match, and identifying detail would
        only be a leak with no bearing on that judgement.
        """
        data = {
            "precedent_id": self.id,
            "symptoms": self.symptoms,
            "diagnosis": self.diagnosis,
            "patient_context": " / ".join(filter(None, [self.age_band, self.gender])) or "not recorded",
            "approved_medicines": self.medicine_list,
            "times_approved_for_similar_cases": self.times_accepted,
        }
        if similarity is not None:
            data["similarity"] = round(similarity, 4)
        return data

    def to_dict(self, similarity=None, include_source=False):
        """The shape shown in the portal.

        `include_source` adds the consultation this was learned from. It is
        the audit trail, so it is available deliberately rather than by
        default — never alongside a suggestion during another patient's
        consultation.
        """
        data = {
            "id": self.id,
            "symptoms": self.symptoms,
            "diagnosis": self.diagnosis,
            "medicines": self.medicine_list,
            "age_band": self.age_band,
            "gender": self.gender,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "department": self.department.name if self.department else None,
            "times_suggested": self.times_suggested,
            "times_accepted": self.times_accepted,
            "approved_at": to_utc_iso(self.approved_at),
            "active": self.is_active,
            "retired_at": to_utc_iso(self.retired_at),
        }
        if similarity is not None:
            data["similarity"] = round(similarity, 4)
        if include_source:
            data["source_consultation_id"] = self.source_consultation_id
        return data

    def __repr__(self):
        return f"<ClinicalPrecedent {self.id} {(self.diagnosis or '')[:40]!r}>"
