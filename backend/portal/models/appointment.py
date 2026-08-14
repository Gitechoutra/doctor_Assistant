from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

# The life of an appointment, in order.
#
#   scheduled    booked for a time that has not arrived yet. Not in the queue.
#   waiting      the patient is here. This is what puts them in the day's queue.
#   in_progress  the doctor has called them in.
#   completed    the consultation is finished.
#   cancelled    withdrawn, by the patient or the desk.
#
# `scheduled` is the one this system did not used to have: every appointment
# was raised at the moment the patient walked up to the desk, so "booked for
# Thursday" had nowhere to live. Booking ahead and arriving are now two
# distinct events -- see `Appointment.check_in`.
STATUSES = ("scheduled", "waiting", "in_progress", "completed", "cancelled")

# Statuses that mean the visit is still live -- somewhere between booked and
# finished. Used by the duplicate check and by consultation claiming.
OPEN_STATUSES = ("scheduled", "waiting", "in_progress")

# Off the book for good -- nothing can be started from one of these. The
# history lists exactly these, and the queue exactly the others, so an
# appointment is always in one view or the other and never in both.
CLOSED_STATUSES = ("completed", "cancelled")

# Statuses that put a patient in today's queue, in queue order.
QUEUE_STATUSES = ("in_progress", "waiting")

STATUS_LABELS = {
    "scheduled": "Scheduled",
    "waiting": "Waiting",
    "in_progress": "In Consultation",
    "completed": "Completed",
    "cancelled": "Cancelled",
}


class Appointment(db.Model):
    __tablename__ = "appointments"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    # Whose appointment this is. Always the practice's doctor in a one-doctor
    # practice, resolved by `helpers/practice.practice_doctor` rather than
    # chosen on a form -- but recorded, so the record still reads correctly if
    # the practice ever takes on a second doctor.
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=True)
    consultation_id = db.Column(db.Integer, db.ForeignKey("consultations.id"), nullable=True)
    status = db.Column(
        db.Enum(*STATUSES, name="appointment_status"),
        nullable=False,
        default="scheduled",
    )
    # When the patient is booked in for. Nullable: a walk-in is checked in
    # without ever having been booked, and `created_at` is its only time.
    scheduled_at = db.Column(db.DateTime, nullable=True)
    # When the patient actually arrived and joined the queue. This, not
    # `scheduled_at`, is what orders the queue -- first here, first seen.
    arrived_at = db.Column(db.DateTime, nullable=True)
    reason = db.Column(db.Text, nullable=True)
    # Why it was called off, when it was. Free text from the desk.
    cancelled_reason = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    patient = db.relationship("Patient")
    doctor = db.relationship("Doctor")
    consultation = db.relationship("Consultation")

    @property
    def code(self):
        """Human-facing appointment number, e.g. APT0123."""
        return f"APT{self.id:04d}"

    @property
    def status_label(self):
        return STATUS_LABELS.get(self.status, self.status)

    @property
    def is_open(self):
        return self.status in OPEN_STATUSES

    @property
    def queued_at(self):
        """The moment this appointment takes its place in the queue.

        Arrival if it is known, otherwise the booked time, otherwise when the
        row was made -- so a walk-in and a booked patient who has checked in
        are ordered against each other by the same clock.
        """
        return self.arrived_at or self.scheduled_at or self.created_at

    def check_in(self, now=None):
        """The patient is here. Moves a booking into today's queue.

        Idempotent: checking in a patient who is already waiting (or already
        with the doctor) does nothing, so a double-press at the desk cannot
        reset their place in the line.
        """
        if self.status != "scheduled":
            return False
        self.status = "waiting"
        self.arrived_at = now or datetime.utcnow()
        return True

    def to_dict(self, queue_number=None, include_consultation=False):
        """`include_consultation` attaches the visit this appointment produced
        — the summary, the medicines prescribed and the report — which is what
        makes a finished appointment readable on its own in the history.
        Deliberately off by default: the live queue draws none of it, and
        loading a summary and a prescription per card would make the queue pay
        for a page it never renders."""
        patient = self.patient
        data = {
            "id": self.id,
            "code": self.code,
            "patient_id": self.patient_id,
            # Flat name kept for existing callers; `patient_detail` carries
            # what the queue cards render (photo, age, code).
            "patient": patient.name if patient else None,
            "patient_detail": (
                {
                    "id": patient.id,
                    "code": patient.code,
                    "name": patient.name,
                    "age": patient.age,
                    "gender": patient.gender,
                    "phone": patient.phone,
                    "photo_url": patient.photo_url,
                }
                if patient
                else None
            ),
            "doctor_id": self.doctor_id,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "consultation_id": self.consultation_id,
            "status": self.status,
            "status_label": self.status_label,
            "reason": self.reason,
            "notes": self.notes,
            "cancelled_reason": self.cancelled_reason,
            "scheduled_at": to_utc_iso(self.scheduled_at),
            "arrived_at": to_utc_iso(self.arrived_at),
            # Position in the waiting queue, assigned by the listing route.
            # 0 for the patient currently with the doctor, 1..n for those
            # waiting — the queue is numbered, never dotted.
            "queue_number": queue_number,
            "created_at": to_utc_iso(self.created_at),
        }

        if include_consultation:
            # None for an appointment cancelled before anyone called the
            # patient in — there is no visit to show, and the card falls back
            # to the appointment's own details.
            data["consultation"] = (
                self.consultation.to_dict(include_summary=True) if self.consultation else None
            )

        return data

    def __repr__(self):
        return f"<Appointment {self.id} {self.status}>"
