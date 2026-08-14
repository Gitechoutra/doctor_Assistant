"""A nurse escalating something to the doctor.

Separate from `notifications` on purpose: a notification is read and gone,
but an alert is a clinical event that stays on the record with who raised it,
who acknowledged it and when. The notification is the doorbell; this is the
thing being reported.
"""

from datetime import datetime

from portal.extensions import db
from portal.models.types import PRECISE_DATETIME, PRECISE_TIMESTAMP
from portal.helpers.datetime_helper import to_utc_iso

CATEGORIES = (
    "emergency",
    "missed_medication",
    "abnormal_observation",
    "critical_change",
    "other",
)
SEVERITIES = ("info", "warning", "critical")
ALERT_STATUSES = ("open", "acknowledged", "resolved")

CATEGORY_LABELS = {
    "emergency": "Emergency",
    "missed_medication": "Missed medication",
    "abnormal_observation": "Abnormal observation",
    "critical_change": "Critical change",
    "other": "Other",
}


class ClinicalAlert(db.Model):
    __tablename__ = "clinical_alerts"

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("nursing_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    nurse_id = db.Column(db.Integer, db.ForeignKey("nurses.id"), nullable=False)
    # Denormalised from the assignment so "my open alerts" is one indexed read
    # for the doctor, without joining through to the assignment.
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=False)

    category = db.Column(db.Enum(*CATEGORIES, name="clinical_alert_category"), nullable=False)
    severity = db.Column(
        db.Enum(*SEVERITIES, name="clinical_alert_severity"), nullable=False, default="warning"
    )
    message = db.Column(db.Text, nullable=False)

    status = db.Column(
        db.Enum(*ALERT_STATUSES, name="clinical_alert_status"), nullable=False, default="open"
    )
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    acknowledged_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    # What the doctor said back — the other half of the audit trail.
    doctor_response = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        PRECISE_TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow
    )

    assignment = db.relationship("NursingAssignment", back_populates="alerts")
    nurse = db.relationship("Nurse")
    doctor = db.relationship("Doctor")
    acknowledger = db.relationship("User", foreign_keys=[acknowledged_by])

    __table_args__ = (
        db.Index("idx_clinical_alerts_doctor_status", "doctor_id", "status", "created_at"),
    )

    def to_dict(self, include_patient=False):
        data = {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "category": self.category,
            "category_label": CATEGORY_LABELS.get(self.category, self.category),
            "severity": self.severity,
            "message": self.message,
            "status": self.status,
            "acknowledged_at": to_utc_iso(self.acknowledged_at),
            "acknowledged_by": self.acknowledger.name if self.acknowledger else None,
            "doctor_response": self.doctor_response,
            "nurse_id": self.nurse_id,
            "nurse": self.nurse.user.name if self.nurse and self.nurse.user else None,
            "created_at": to_utc_iso(self.created_at),
        }
        if include_patient:
            patient = self.assignment.patient if self.assignment else None
            data["patient"] = patient.name if patient else None
            data["patient_code"] = patient.code if patient else None
        return data

    def __repr__(self):
        return f"<ClinicalAlert {self.id} {self.category} {self.status}>"
