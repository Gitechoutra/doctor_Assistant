"""A course of treatment: one or more consultation sessions for one problem.

A `Consultation` is a single session — one recording, one summary, one
prescription — and it is never reused or overwritten. When a patient needs to
carry on the discussion another time, the doctor starts a *new* consultation
that joins the same open case, so the earlier session's transcript, summary
and prescription stay exactly as they were signed off.

The case is what gets closed at the end of treatment, and closing it is what
produces the single consolidated report: every session in order, followed by
one final medication list merged from all of them.
"""

from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class PatientCase(db.Model):
    __tablename__ = "patient_cases"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=False)
    status = db.Column(
        db.Enum("open", "closed", name="patient_case_status"),
        nullable=False,
        default="open",
    )
    # What the patient first came in for, carried over from the appointment
    # that opened the case — it labels the case in lists where showing the
    # whole diagnosis would be too much.
    reason = db.Column(db.String(255), nullable=True)
    opened_at = db.Column(db.DateTime, nullable=True)
    closed_at = db.Column(db.DateTime, nullable=True)
    closed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    # --- Consolidation, written when the case is closed --------------------
    # These describe the whole course of treatment, not any one session. They
    # are regenerated from scratch on every close, so re-closing a reopened
    # case never leaves a stale mixture of old and new sessions.
    final_summary = db.Column(db.Text, nullable=True)
    final_diagnosis = db.Column(db.Text, nullable=True)
    # How the patient changed from the first session to the last — the thing a
    # reader of the consolidated report most wants and cannot get from any
    # single session's summary.
    progression = db.Column(db.Text, nullable=True)
    final_follow_up_advice = db.Column(db.Text, nullable=True)
    final_lifestyle_advice = db.Column(db.Text, nullable=True)
    consolidated_at = db.Column(db.DateTime, nullable=True)

    # Sign-off on the consolidated prescription. Same rule as a session's:
    # editing the final medicines clears the signature, so a signature always
    # refers to the exact list that was reviewed.
    final_verified_at = db.Column(db.DateTime, nullable=True)
    final_verified_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    __table_args__ = (
        # Backs "this patient's open case" / "this patient's cases by status"
        # lookups. Declared explicitly because it was added via a raw
        # migration rather than a model column flag — without this, autogenerate
        # can't see it and proposes to drop it on every `flask db migrate`.
        db.Index("ix_patient_cases_patient_status", "patient_id", "status"),
    )

    patient = db.relationship("Patient")
    doctor = db.relationship("Doctor")
    closed_by_user = db.relationship("User", foreign_keys=[closed_by])
    verified_by = db.relationship("User", foreign_keys=[final_verified_by])
    sessions = db.relationship(
        "Consultation",
        back_populates="case",
        order_by="Consultation.session_number",
    )
    final_prescriptions = db.relationship(
        "CasePrescription",
        back_populates="case",
        order_by="CasePrescription.id",
        cascade="all, delete-orphan",
    )
    # One consolidated report per case (reports.case_id is unique).
    report = db.relationship("Report", back_populates="case", uselist=False, viewonly=True)

    @property
    def code(self):
        """Human-facing case ID, e.g. CASE0007."""
        return f"CASE{self.id:04d}"

    @property
    def completed_sessions(self):
        return [s for s in self.sessions if s.status == "completed"]

    @property
    def open_session(self):
        """The session currently being recorded, if any. At most one — a case
        cannot start a second session while one is still running."""
        return next((s for s in self.sessions if s.status != "completed"), None)

    @property
    def todays_session(self):
        """The session recorded today, if the patient has already been seen.

        A visit is a day: while one of these exists, more conversation belongs
        to it rather than to a new session, so this is what decides whether
        the case offers "continue today's session" or "start the next one".
        """
        return next((s for s in self.sessions if s.is_from_today), None)

    @property
    def is_consolidated(self):
        return self.consolidated_at is not None

    def to_dict(self, include_sessions=False):
        data = {
            "id": self.id,
            "code": self.code,
            "patient_id": self.patient_id,
            "patient": self.patient.name if self.patient else None,
            "doctor_id": self.doctor_id,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "status": self.status,
            "reason": self.reason,
            "opened_at": to_utc_iso(self.opened_at),
            "closed_at": to_utc_iso(self.closed_at),
            "closed_by": self.closed_by_user.name if self.closed_by_user else None,
            "session_count": len(self.sessions),
            "completed_session_count": len(self.completed_sessions),
            "has_open_session": self.open_session is not None,
            "open_session_id": self.open_session.id if self.open_session else None,
            # Set while the patient has already been seen today, which is what
            # makes "start the next session" the wrong action — today's extra
            # conversation belongs to this session.
            "todays_session_id": self.todays_session.id if self.todays_session else None,
            "todays_session_number": (
                self.todays_session.session_number if self.todays_session else None
            ),
            "consolidated": self.is_consolidated,
            "consolidated_at": to_utc_iso(self.consolidated_at),
            "final_verified": self.final_verified_at is not None,
            "final_verified_at": to_utc_iso(self.final_verified_at),
            "final_verified_by": self.verified_by.name if self.verified_by else None,
            "report": (
                {"id": self.report.id, "generated_at": to_utc_iso(self.report.generated_at)}
                if self.report
                else None
            ),
        }

        if include_sessions:
            data["patient_detail"] = self.patient.to_dict() if self.patient else None
            data["consolidation"] = {
                "final_summary": self.final_summary,
                "final_diagnosis": self.final_diagnosis,
                "progression": self.progression,
                # Stored newline-joined, same as a session summary's advice.
                "follow_up_advice": (self.final_follow_up_advice or "").splitlines(),
                "lifestyle_advice": (self.final_lifestyle_advice or "").splitlines(),
            }
            data["final_prescriptions"] = [p.to_dict() for p in self.final_prescriptions]
            data["sessions"] = [s.to_dict(include_summary=True) for s in self.sessions]

        return data

    def __repr__(self):
        return f"<PatientCase {self.id} {self.status}>"
