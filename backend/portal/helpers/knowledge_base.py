"""Learning from what doctors here have approved, and retrieving it later.

Three operations, in the order they happen to a case:

  learn_from_approval  a doctor signs off a prescription -> it enters the
                       knowledge base
  find_similar         a later consultation ends -> approved cases with a
                       matching presentation are retrieved for the AI
  record_acceptance    that later prescription is itself signed off -> the
                       precedents that shaped it are credited

The rules the module exists to hold:

*Only approved work is learned.* Nothing enters the knowledge base until a
doctor has personally signed it off, and withdrawing a sign-off retires the
entry. The AI can therefore only ever suggest on the basis of a decision a
real doctor made and stood behind.

*Precedents are de-identified.* They are read during a different patient's
consultation and sent to an external model, so they carry clinical content and
coarse demographics only. The link back to the source consultation stays in
the database for the audit trail and is never sent anywhere.

*Retrieval is recall-oriented; the model is the precision filter.* The
similarity floor is set to let a plausible candidate through, and the prompt
tells the model to ignore any precedent whose clinical picture does not
genuinely match. Deciding that from wording alone is exactly what an embedding
cannot do.

Callers add to the open session; the caller commits.
"""

import json
import logging
from datetime import datetime

from portal.ai import gemini_client
from portal.extensions import db
from portal.models.clinical_precedent import ClinicalPrecedent, normalise

# A child of the app's own "portal" logger, so these land in portal.log
# alongside everything else rather than only on stderr.
logger = logging.getLogger(__name__)

# How many approved cases to put in front of the model. Enough to offer a
# genuine choice where several past cases are relevant, few enough that the
# consultation itself stays the main thing in the prompt.
MAX_PRECEDENTS = 3

# Cosine floor for a candidate. Measured against this embedding model: matching
# presentations score ~0.75-0.79 and an unrelated condition ~0.63, so 0.70 sits
# in the gap with room either side. Deliberately permissive rather than tight —
# a candidate the model then rejects costs a few tokens, while a real match
# filtered out here is a suggestion the doctor never sees.
SIMILARITY_FLOOR = 0.70

# A ceiling on the rows scanned per retrieval. Similarity is computed in
# Python over every active vector, which is fine for a hospital-sized
# knowledge base; this stops that assumption failing silently if it ever
# stops being true.
MAX_CANDIDATES = 5000

AGE_BANDS = ((1, "infant"), (12, "child"), (18, "adolescent"), (30, "18-29"),
             (40, "30-39"), (50, "40-49"), (60, "50-59"), (70, "60-69"))


def age_band(age):
    """Buckets an age, because a precedent needs the age range to be judged
    but an exact age next to a diagnosis helps identify someone."""
    if age is None:
        return None
    for limit, label in AGE_BANDS:
        if age < limit:
            return label
    return "70+"


def _precedent_text(symptoms, diagnosis):
    """What gets embedded for a stored case.

    Symptoms lead because that is what a new patient presents with; the
    diagnosis follows as the clinical interpretation of them. Matching the
    two together works better than either alone — "burning stomach pain"
    finds gastritis, and so does "acid peptic disease".
    """
    parts = []
    if symptoms:
        parts.append(f"Symptoms: {symptoms.strip()}")
    if diagnosis:
        parts.append(f"Diagnosis: {diagnosis.strip()}")
    return "\n".join(parts)


def _query_text(messages, limit=8000):
    """What gets embedded for a live consultation.

    The raw transcript, which is the only description of the presentation
    available before the summary exists. Truncated because a long consultation
    wanders into scheduling and small talk, and the presenting complaint is
    almost always established early.
    """
    joined = "\n".join((m.message or "") for m in messages)
    return joined[:limit].strip()


def learn_from_approval(consultation):
    """Records an approved consultation in the knowledge base.

    Called when a doctor verifies a prescription — the moment the medicines
    stop being a suggestion and become that doctor's own decision. Re-approving
    a consultation refreshes the existing entry in place rather than adding a
    second, so one consultation always contributes exactly one precedent.

    Returns the precedent, or None when there is nothing worth learning (no
    summary, or no medicines to carry forward — an empty prescription teaches
    nothing about how to treat anyone).
    """
    summary = consultation.summary
    medicines = [
        {
            "medicine_name": p.medicine_name,
            "dose": p.dose,
            "frequency": p.frequency,
            "duration": p.duration,
        }
        for p in consultation.prescriptions
    ]
    if not summary or not medicines:
        return None

    # Everything is read before the row is created. Touching a lazy
    # relationship emits a query, a query autoflushes the session, and an
    # autoflush of a half-populated row fails on its NOT NULL columns — so no
    # relationship may be reached for after the row joins the session.
    patient = consultation.patient
    doctor = consultation.doctor
    existing = ClinicalPrecedent.query.filter_by(
        source_consultation_id=consultation.id
    ).first()

    values = {
        "doctor_id": consultation.doctor_id,
        "department_id": doctor.department_id if doctor else None,
        "symptoms": summary.symptoms,
        "diagnosis": summary.possible_diagnosis,
        "medicines": json.dumps(medicines),
        "age_band": age_band(patient.age if patient else None),
        "gender": patient.gender if patient else None,
        "approved_at": consultation.prescription_verified_at or datetime.utcnow(),
        # Re-approving after a withdrawal puts it back in circulation.
        "retired_at": None,
    }

    if existing is None:
        precedent = ClinicalPrecedent(source_consultation_id=consultation.id, **values)
        db.session.add(precedent)
    else:
        precedent = existing
        for field, value in values.items():
            setattr(precedent, field, value)

    text = _precedent_text(precedent.symptoms, precedent.diagnosis)
    try:
        vector = gemini_client.embed_text(text, is_query=False)
        precedent.set_embedding(vector, gemini_client.embedding_model_name(), text)
    except Exception:  # noqa: BLE001 - never fail an approval over the index
        # The sign-off is the doctor's action and must succeed regardless. The
        # row is still stored and still auditable; it simply cannot be matched
        # semantically until something re-embeds it.
        logger.exception(
            "Could not embed precedent for consultation %s; stored without a vector",
            consultation.id,
        )
        precedent.set_embedding(None, None, text)

    return precedent


def retire_for(consultation):
    """Takes a consultation's precedent out of circulation.

    Called when a sign-off is withdrawn: the prescription is no longer
    doctor-approved, so it must stop informing anyone else's treatment. The
    row is kept and marked rather than deleted, so the audit trail still shows
    what the knowledge base contained and when it changed.
    """
    precedent = ClinicalPrecedent.query.filter_by(
        source_consultation_id=consultation.id, retired_at=None
    ).first()
    if not precedent:
        return None
    precedent.retired_at = datetime.utcnow()
    return precedent


def _active_candidates(exclude_patient_id=None):
    query = ClinicalPrecedent.query.filter(
        ClinicalPrecedent.retired_at.is_(None),
        ClinicalPrecedent.embedding.isnot(None),
    )
    if exclude_patient_id is not None:
        # A patient's own earlier visits are already given to the model in
        # full as prior sessions. Letting them back in as anonymous
        # "precedents" would double-count the same history and read as
        # independent corroboration when it is nothing of the kind.
        from portal.models.consultation import Consultation

        query = query.join(
            Consultation, ClinicalPrecedent.source_consultation_id == Consultation.id
        ).filter(Consultation.patient_id != exclude_patient_id)
    return query.limit(MAX_CANDIDATES).all()


def find_similar(messages, exclude_patient_id=None, limit=MAX_PRECEDENTS):
    """Approved cases whose presentation resembles this consultation's.

    Returns a list of (precedent, similarity), best first, or an empty list if
    there is nothing to match against or matching is unavailable. Retrieval
    failure is never fatal: a consultation that cannot reach the knowledge
    base falls back to being summarised on its own merits, which is exactly
    how every consultation worked before it existed.
    """
    text = _query_text(messages)
    if not text:
        return []

    candidates = _active_candidates(exclude_patient_id)
    if not candidates:
        return []

    try:
        query_vector = gemini_client.embed_text(text, is_query=True)
    except Exception:  # noqa: BLE001 - degrade to no precedents, never 500
        logger.exception("Could not embed the consultation; skipping precedent retrieval")
        return []
    if not query_vector:
        return []

    query_vector = normalise(query_vector)

    scored = []
    for precedent in candidates:
        vector = precedent.vector
        # Stored vectors are normalised, so cosine similarity is the dot
        # product. A vector from a different embedding model has a different
        # width and is skipped rather than compared meaninglessly.
        if not vector or len(vector) != len(query_vector):
            continue
        similarity = sum(a * b for a, b in zip(query_vector, vector))
        if similarity >= SIMILARITY_FLOOR:
            scored.append((precedent, similarity))

    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:limit]


def snapshot_matches(matches):
    """Freezes retrieved precedents for storage against the summary.

    A snapshot rather than a list of ids: this records what the AI was shown
    when it produced this prescription, and that has to stay true even after a
    precedent is retired or its source consultation is edited.
    """
    return [
        {
            "precedent_id": precedent.id,
            "similarity": round(similarity, 4),
            "symptoms": precedent.symptoms,
            "diagnosis": precedent.diagnosis,
            "medicines": precedent.medicine_list,
            "doctor": precedent.doctor.user.name
            if precedent.doctor and precedent.doctor.user
            else None,
            "department": precedent.department.name if precedent.department else None,
            "approved_at": precedent.approved_at.isoformat() if precedent.approved_at else None,
        }
        for precedent, similarity in matches
    ]


def record_suggested(matches):
    """Counts a retrieval against each precedent that was put in front of the
    model — the denominator for how often a precedent is actually kept."""
    for precedent, _similarity in matches:
        precedent.times_suggested = (precedent.times_suggested or 0) + 1


def record_acceptance(consultation):
    """Credits the precedents whose medicines survived to the doctor's sign-off.

    Called on approval. A precedent counts as accepted when at least one
    medicine it contributed is still in the prescription the doctor actually
    signed — the difference between a suggestion that was merely shown and one
    that a doctor was willing to put their name to.
    """
    summary = consultation.summary
    if not summary:
        return []

    matches = summary.precedent_list
    if not matches:
        return []

    approved_names = {
        (p.medicine_name or "").strip().lower() for p in consultation.prescriptions
    }
    if not approved_names:
        return []

    accepted = []
    for match in matches:
        suggested_names = {
            (m.get("medicine_name") or "").strip().lower()
            for m in match.get("medicines") or []
        }
        if not (suggested_names & approved_names):
            continue
        precedent = ClinicalPrecedent.query.get(match.get("precedent_id"))
        if precedent:
            precedent.times_accepted = (precedent.times_accepted or 0) + 1
            accepted.append(precedent)
    return accepted
