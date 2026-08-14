from datetime import datetime

from portal.extensions import db


class CasePrescription(db.Model):
    """One medicine on a case's consolidated (final) prescription.

    Deliberately a separate table from `generated_prescriptions` rather than a
    flag on it: a session's prescription is a historical record of what was
    prescribed that day and must never change when the case is later
    consolidated. The final list is a new document derived from all of them.
    """

    __tablename__ = "case_prescriptions"

    id = db.Column(db.Integer, primary_key=True)
    case_id = db.Column(db.Integer, db.ForeignKey("patient_cases.id"), nullable=False)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True)
    # The pharmacy catalogue item, same as on a session's prescription.
    brand_id = db.Column(db.Integer, db.ForeignKey("medicine_brands.id"), nullable=True)
    medicine_name = db.Column(db.String(150), nullable=False)
    dose = db.Column(db.String(255), nullable=True)
    frequency = db.Column(db.String(255), nullable=True)
    duration = db.Column(db.String(255), nullable=True)
    # Same three as a session's prescription line — what the pharmacy hands
    # over, how the patient takes it, and the doctor's own note.
    quantity = db.Column(db.String(80), nullable=True)
    route = db.Column(db.String(20), nullable=True)
    instructions = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    # Carried through from the session line it was merged from, so a
    # hand-entered medicine stays identifiable on the consolidated sheet.
    is_custom = db.Column(db.Boolean, nullable=False, default=False)
    # Which session this medicine's current instruction came from, so a reader
    # of the final prescription can tell a drug started on day one from one
    # added at the last review. Null for a row the doctor typed in by hand.
    source_session_number = db.Column(db.Integer, nullable=True)
    # Short provenance note, e.g. "dose increased at session 2" or "continued
    # from session 1" — the part of the merge a plain medicine list can't show.
    note = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    case = db.relationship("PatientCase", back_populates="final_prescriptions")
    medicine = db.relationship("Medicine")
    brand = db.relationship("MedicineBrand")

    def to_dict(self):
        return {
            "id": self.id,
            "medicine_name": self.medicine_name,
            "dose": self.dose,
            "frequency": self.frequency,
            "duration": self.duration,
            "quantity": self.quantity,
            "route": self.route,
            "is_custom": self.is_custom,
            "instructions": self.instructions
            or (self.brand.usage_instructions if self.brand else None),
            "notes": self.notes,
            "source_session_number": self.source_session_number,
            "note": self.note,
            "matched_formulary": self.medicine_id is not None or self.brand_id is not None,
            "brand_id": self.brand_id,
            "usage_instructions": self.brand.usage_instructions if self.brand else None,
        }

    def __repr__(self):
        return f"<CasePrescription {self.medicine_name}>"
