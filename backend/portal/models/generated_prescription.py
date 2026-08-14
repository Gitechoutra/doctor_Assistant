from datetime import datetime

from portal.extensions import db
# Reused rather than redefined: a prescription and the nursing medication
# order it becomes must describe the same route with the same word.
from portal.models.medication_order import ROUTE_LABELS, ROUTES  # noqa: F401


class GeneratedPrescription(db.Model):
    __tablename__ = "generated_prescriptions"

    id = db.Column(db.Integer, primary_key=True)
    consultation_id = db.Column(db.Integer, db.ForeignKey("consultations.id"), nullable=False)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True)
    # The pharmacy catalogue item this line was written against. Doctors now
    # prescribe from their department's stocked inventory, so this is what
    # links a prescription to something the hospital can actually dispense —
    # `medicine_id` remains the older clinical-formulary link, kept because
    # nursing medication orders still resolve against it.
    brand_id = db.Column(db.Integer, db.ForeignKey("medicine_brands.id"), nullable=True)
    medicine_name = db.Column(db.String(150), nullable=False)
    # Gemini writes these as free text (e.g. "Twice daily after meals for the
    # first week, then once daily"), which can run longer than a short code
    # like "BID" — sized generously rather than truncating clinical instructions.
    dose = db.Column(db.String(255), nullable=True)
    frequency = db.Column(db.String(255), nullable=True)
    duration = db.Column(db.String(255), nullable=True)
    # How much to dispense — "20 tablets", "1 bottle". Distinct from dose:
    # dose is how much the patient takes at a time, quantity is what the
    # pharmacy hands over, and a counter cannot infer one from the other.
    quantity = db.Column(db.String(80), nullable=True)
    # How it is given. Only worth recording when the medicine is entered by
    # hand — a catalogue item already carries its dosage form.
    route = db.Column(db.String(20), nullable=True)
    # True when the doctor typed this medicine in rather than picking it from
    # the pharmacy's catalogue. Explicit rather than inferred from a missing
    # brand link: a line can lose its link when a medicine is archived, and
    # that is not the same as a doctor deliberately going off-catalogue.
    is_custom = db.Column(db.Boolean, nullable=False, default=False)
    # How to take it, printed on the label. Defaults from the catalogue item's
    # usage instructions and is editable per prescription, since the same drug
    # is given differently to different patients.
    instructions = db.Column(db.Text, nullable=True)
    # The doctor's private note on this line — why this drug, what to watch
    # for. Kept apart from `instructions`, which is written for the patient.
    notes = db.Column(db.Text, nullable=True)
    # The doctor-approved case this suggestion was carried over from, when it
    # came from one. Null means the AI proposed it from the consultation alone
    # — a distinction the reviewing doctor should be able to see, since the
    # two carry very different amounts of prior human judgement.
    source_precedent_id = db.Column(
        db.Integer, db.ForeignKey("clinical_precedents.id"), nullable=True
    )
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    consultation = db.relationship("Consultation", back_populates="prescriptions")
    medicine = db.relationship("Medicine")
    brand = db.relationship("MedicineBrand")
    source_precedent = db.relationship("ClinicalPrecedent", foreign_keys=[source_precedent_id])

    def to_dict(self):
        return {
            "id": self.id,
            "medicine_name": self.medicine_name,
            "dose": self.dose,
            "frequency": self.frequency,
            "duration": self.duration,
            "quantity": self.quantity,
            "route": self.route,
            "route_label": ROUTE_LABELS.get(self.route) if self.route else None,
            "is_custom": self.is_custom,
            # Falls back to the catalogue item's standing instructions when
            # the doctor did not write their own, so the label is never blank
            # for a medicine the pharmacy has instructions for.
            "instructions": self.instructions
            or (self.brand.usage_instructions if self.brand else None),
            "notes": self.notes,
            # True when this line names something in the hospital's own
            # catalogue. Either link counts: a brand from the department's
            # inventory, or a clinical formulary entry.
            "matched_formulary": self.medicine_id is not None or self.brand_id is not None,
            "brand_id": self.brand_id,
            "usage_instructions": self.brand.usage_instructions if self.brand else None,
            "availability": self.brand.availability() if self.brand else None,
            "from_precedent": self.source_precedent_id is not None,
            "source_precedent_id": self.source_precedent_id,
        }

    def __repr__(self):
        return f"<GeneratedPrescription {self.medicine_name}>"
