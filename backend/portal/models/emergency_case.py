"""A patient whose treatment cannot wait for the normal OP queue.

Registration -> OP -> Consultation assumes there is time to raise an OP first
-- `create_appointment` refuses one until the patient already has an assigned
doctor and a matching department. An accident, a stroke, an unconscious
arrival has none of that yet, and treatment cannot wait for it.

An EmergencyCase is the parallel, lightweight entry point: reception logs the
arrival, any on-duty doctor claims it and works from `assessment_notes` /
`treatment_notes` / `decision` directly on this row -- not a Consultation,
which cannot even be closed without a recorded conversation (see
`consultation_routes.end_consultation`). Claiming does not touch
`patients.assigned_doctor_id`; it grants the claiming doctor temporary access
to this one patient for as long as the case stays `in_progress` (see
`helpers/patient_access.has_active_emergency_claim`), so a patient's regular
doctor never loses visibility because someone else handled their emergency.

`linked_appointment_id` / `linked_consultation_id` are how "OP raised later"
stays connected to the episode that started it -- set automatically when
`create_appointment` finds an unlinked case for the same patient, or by hand
via `POST /emergency/<id>/link-appointment`.
"""

from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

SEVERITIES = ("critical", "serious", "stable")
STATUSES = ("waiting", "in_progress", "resolved", "cancelled")
DECISIONS = ("ot_surgery", "icu", "observation", "discharge", "other")


class EmergencyCase(db.Model):
    __tablename__ = "emergency_cases"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    # Reception may not know this yet for an unidentified arrival.
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    # Unassigned until a doctor claims it -- mirrors Appointment.doctor_id.
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=True)
    registered_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    reason = db.Column(db.Text, nullable=False)
    severity = db.Column(
        db.Enum(*SEVERITIES, name="emergency_case_severity"), nullable=False, default="serious"
    )
    status = db.Column(
        db.Enum(*STATUSES, name="emergency_case_status"), nullable=False, default="waiting"
    )
    # What the claiming doctor decided the patient needs. Set from the
    # detail page once assessment is far enough along; nothing here forces
    # it to be set before the patient is actually treated.
    decision = db.Column(db.Enum(*DECISIONS, name="emergency_case_decision"), nullable=True)

    arrived_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    assessed_at = db.Column(db.DateTime, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    assessment_notes = db.Column(db.Text, nullable=True)
    treatment_notes = db.Column(db.Text, nullable=True)

    # Set once a normal OP or a full consultation exists for this same
    # episode, so the record stays traceable end to end.
    linked_appointment_id = db.Column(db.Integer, db.ForeignKey("appointments.id"), nullable=True)
    linked_consultation_id = db.Column(
        db.Integer, db.ForeignKey("consultations.id"), nullable=True
    )

    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    patient = db.relationship("Patient")
    department = db.relationship("Department")
    doctor = db.relationship("Doctor")
    registered_by = db.relationship("User", foreign_keys=[registered_by_id])
    resolved_by = db.relationship("User", foreign_keys=[resolved_by_id])
    linked_appointment = db.relationship("Appointment")
    linked_consultation = db.relationship("Consultation")

    __table_args__ = (
        # The queue ordering every list view uses: open cases, worst first.
        db.Index("idx_emergency_cases_status_severity", "status", "severity"),
    )

    @property
    def code(self):
        """Human-facing emergency case ID, e.g. EMG0007."""
        return f"EMG{self.id:04d}"

    def to_dict(self):
        patient = self.patient
        return {
            "id": self.id,
            "code": self.code,
            "patient_id": self.patient_id,
            "patient_detail": (
                {
                    "id": patient.id,
                    "code": patient.code,
                    "name": patient.name,
                    "age": patient.age,
                    "gender": patient.gender,
                    "phone": patient.phone,
                    "blood_group": patient.blood_group,
                    "photo_url": patient.photo_url,
                }
                if patient
                else None
            ),
            "department_id": self.department_id,
            "department": self.department.name if self.department else None,
            "doctor_id": self.doctor_id,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "registered_by_id": self.registered_by_id,
            "registered_by": self.registered_by.name if self.registered_by else None,
            "reason": self.reason,
            "severity": self.severity,
            "status": self.status,
            "decision": self.decision,
            "arrived_at": to_utc_iso(self.arrived_at),
            "assessed_at": to_utc_iso(self.assessed_at),
            "resolved_at": to_utc_iso(self.resolved_at),
            "resolved_by": self.resolved_by.name if self.resolved_by else None,
            "assessment_notes": self.assessment_notes,
            "treatment_notes": self.treatment_notes,
            "linked_appointment_id": self.linked_appointment_id,
            "linked_consultation_id": self.linked_consultation_id,
            "created_at": to_utc_iso(self.created_at),
            "updated_at": to_utc_iso(self.updated_at),
        }

    def __repr__(self):
        return f"<EmergencyCase {self.code} patient={self.patient_id} status={self.status}>"
