from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class Report(db.Model):
    """A generated PDF, of one of two kinds.

    A *session* report covers a single consultation — what the doctor prints
    when the patient leaves after one visit. A *case* report is the
    consolidated document produced when a course of treatment is closed: every
    session in order, followed by one merged final prescription.

    Exactly one of `consultation_id` / `case_id` is set. Both are unique, so a
    consultation and a case each have at most one report and regenerating
    overwrites in place rather than piling up files.
    """

    __tablename__ = "reports"

    id = db.Column(db.Integer, primary_key=True)
    consultation_id = db.Column(
        db.Integer, db.ForeignKey("consultations.id"), nullable=True, unique=True
    )
    case_id = db.Column(
        db.Integer, db.ForeignKey("patient_cases.id"), nullable=True, unique=True
    )
    file_path = db.Column(db.String(255), nullable=False)
    generated_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    consultation = db.relationship("Consultation", overlaps="report")
    case = db.relationship("PatientCase", back_populates="report")

    @property
    def kind(self):
        return "case" if self.case_id else "consultation"

    def _patient_and_doctor(self):
        owner = self.case or self.consultation
        if not owner:
            return None, None
        patient = owner.patient.name if owner.patient else None
        doctor = owner.doctor.user.name if owner.doctor and owner.doctor.user else None
        return patient, doctor

    def to_dict(self):
        patient, doctor = self._patient_and_doctor()
        return {
            "id": self.id,
            "kind": self.kind,
            "consultation_id": self.consultation_id,
            "case_id": self.case_id,
            # Which case/session this covers, for a list that mixes both kinds.
            "label": (
                f"{self.case.code} · {len(self.case.sessions)} session"
                f"{'' if len(self.case.sessions) == 1 else 's'}"
                if self.case
                else f"Session {self.consultation.session_number}"
                if self.consultation and self.consultation.session_number
                else "Single consultation"
            ),
            "patient": patient,
            "doctor": doctor,
            "generated_at": to_utc_iso(self.generated_at),
        }

    def __repr__(self):
        target = f"case={self.case_id}" if self.case_id else f"consultation={self.consultation_id}"
        return f"<Report {target}>"
