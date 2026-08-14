from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class Consultation(db.Model):
    __tablename__ = "consultations"

    id = db.Column(db.Integer, primary_key=True)
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    # The course of treatment this session belongs to. Every consultation gets
    # one — sessions 2, 3 … join the patient's open case instead of replacing
    # anything, which is what keeps each session's transcript, summary and
    # prescription intact when the next one starts.
    case_id = db.Column(db.Integer, db.ForeignKey("patient_cases.id"), nullable=True)
    # 1-based position within the case. Stored rather than derived so the
    # number printed on a report can never shift under a saved document.
    session_number = db.Column(db.Integer, nullable=True)
    status = db.Column(
        db.Enum("scheduled", "in_progress", "completed", name="consultation_status"),
        nullable=False,
        default="scheduled",
    )
    started_at = db.Column(db.DateTime, nullable=True)
    ended_at = db.Column(db.DateTime, nullable=True)
    # Set when a doctor signs off the AI-suggested prescription. Cleared
    # whenever the prescription is edited, so a signature always refers to
    # the exact medicines that were reviewed.
    prescription_verified_at = db.Column(db.DateTime, nullable=True)
    prescription_verified_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    verified_by = db.relationship("User", foreign_keys=[prescription_verified_by])
    doctor = db.relationship("Doctor", back_populates="consultations")
    patient = db.relationship("Patient", back_populates="consultations")
    case = db.relationship("PatientCase", back_populates="sessions")
    messages = db.relationship(
        "ConversationMessage",
        back_populates="consultation",
        order_by="ConversationMessage.created_at",
        cascade="all, delete-orphan",
    )
    summary = db.relationship(
        "ConsultationSummary",
        back_populates="consultation",
        uselist=False,
        cascade="all, delete-orphan",
    )
    prescriptions = db.relationship(
        "GeneratedPrescription", back_populates="consultation", cascade="all, delete-orphan"
    )
    # One report per consultation (reports.consultation_id is unique).
    report = db.relationship("Report", uselist=False, viewonly=True)

    @property
    def duration_seconds(self):
        """How long the consultation ran, or None while it's still open."""
        if not self.started_at or not self.ended_at:
            return None
        return max(0, int((self.ended_at - self.started_at).total_seconds()))

    @property
    def is_from_today(self):
        """Whether this session was started today.

        The line between "the same visit" and "a new visit" is the calendar
        day: a patient still in the room who remembers one more thing is
        continuing this conversation, while a patient who comes back another
        day is a new session with its own summary and prescription.

        Compared in UTC, like every other date in the app (the appointment
        queue's "today" filter, the consultation period filters) — a single
        clock everywhere beats a more local answer in one place only.
        """
        moment = self.started_at or self.created_at
        return bool(moment) and moment.date() == datetime.utcnow().date()

    @property
    def can_continue(self):
        """Whether more conversation can still be added to this session.

        Continuing regenerates the summary and prescription over the whole
        transcript, so a signed-off prescription blocks it — the signature
        would otherwise end up attached to medicines nobody reviewed. The
        doctor unlocks it first, exactly as they would to edit it.
        """
        return (
            self.status == "completed"
            and self.is_from_today
            and self.prescription_verified_at is None
        )

    def to_dict(self, include_detail=False, include_summary=False):
        """`include_summary` adds everything the Consultations list renders;
        `include_detail` adds the full transcript on top, which is only worth
        sending for a single consultation."""
        data = {
            "id": self.id,
            "doctor_id": self.doctor_id,
            "patient_id": self.patient_id,
            "case_id": self.case_id,
            "session_number": self.session_number,
            # Enough for the consultation room to say "Session 2 of 3" and
            # offer the case, without a second request.
            "case": (
                {
                    "id": self.case.id,
                    "code": self.case.code,
                    "status": self.case.status,
                    "session_count": len(self.case.sessions),
                    "consolidated": self.case.is_consolidated,
                }
                if self.case
                else None
            ),
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "patient": self.patient.name if self.patient else None,
            "status": self.status,
            "started_at": to_utc_iso(self.started_at),
            "ended_at": to_utc_iso(self.ended_at),
            "duration_seconds": self.duration_seconds,
            "is_from_today": self.is_from_today,
            # Tells the room which of the two follow-on actions to offer:
            # carry on this same conversation, or open a new session. They are
            # mutually exclusive by design — the same visit must never be
            # split across two sessions, and two visits must never be merged
            # into one.
            "can_continue": self.can_continue,
            "continue_blocked_by_verification": (
                self.status == "completed"
                and self.is_from_today
                and self.prescription_verified_at is not None
            ),
            "prescription_verified": self.prescription_verified_at is not None,
            "prescription_verified_at": to_utc_iso(self.prescription_verified_at),
            "prescription_verified_by": (
                self.verified_by.name if self.verified_by else None
            ),
        }

        if include_summary or include_detail:
            data["patient_detail"] = self.patient.to_dict() if self.patient else None
            data["summary"] = self.summary.to_dict() if self.summary else None
            data["prescriptions"] = [p.to_dict() for p in self.prescriptions]
            data["report"] = (
                {"id": self.report.id, "generated_at": to_utc_iso(self.report.generated_at)}
                if self.report
                else None
            )

        if include_detail:
            data["messages"] = [m.to_dict() for m in self.messages]

        return data

    def __repr__(self):
        return f"<Consultation {self.id} {self.status}>"
