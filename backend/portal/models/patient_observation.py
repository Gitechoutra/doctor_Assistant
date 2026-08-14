"""A nurse's round: vitals, symptoms, how recovery is going, complications.

Whether an observation is abnormal is decided here rather than in the UI, so
the doctor's monitor, the nurse's screen and any alert raised off the back of
it all agree on the same reading.
"""

from datetime import datetime

from portal.extensions import db
from portal.models.types import PRECISE_DATETIME, PRECISE_TIMESTAMP
from portal.helpers.datetime_helper import to_utc_iso

# (field, low, high, label). A value outside [low, high] is flagged; None on
# either side means that end is unbounded. Adult ward ranges — deliberately
# wide, because this drives a "look at this" flag for the doctor, not a
# diagnosis, and a flag that cries wolf gets ignored.
VITAL_RANGES = (
    ("temperature_c", 35.0, 38.0, "Temperature"),
    ("pulse_bpm", 50, 120, "Pulse"),
    ("systolic_bp", 90, 160, "Systolic BP"),
    ("diastolic_bp", 60, 100, "Diastolic BP"),
    ("respiratory_rate", 10, 24, "Respiratory rate"),
    ("spo2", 92, None, "SpO₂"),
    ("blood_sugar", 70.0, 250.0, "Blood sugar"),
    ("pain_score", None, 6, "Pain score"),
)


class PatientObservation(db.Model):
    __tablename__ = "patient_observations"

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("nursing_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    nurse_id = db.Column(db.Integer, db.ForeignKey("nurses.id"), nullable=False)
    recorded_at = db.Column(PRECISE_DATETIME, nullable=False, default=datetime.utcnow)

    temperature_c = db.Column(db.Numeric(4, 1), nullable=True)
    pulse_bpm = db.Column(db.Integer, nullable=True)
    systolic_bp = db.Column(db.Integer, nullable=True)
    diastolic_bp = db.Column(db.Integer, nullable=True)
    respiratory_rate = db.Column(db.Integer, nullable=True)
    spo2 = db.Column(db.Integer, nullable=True)
    blood_sugar = db.Column(db.Numeric(6, 1), nullable=True)
    pain_score = db.Column(db.Integer, nullable=True)

    symptoms = db.Column(db.Text, nullable=True)
    recovery_progress = db.Column(db.Text, nullable=True)
    complications = db.Column(db.Text, nullable=True)

    # Stored, not derived on read: the ranges above may be retuned later, and
    # an old observation must keep the judgement that was made at the time.
    is_abnormal = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(
        PRECISE_TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow
    )

    assignment = db.relationship("NursingAssignment", back_populates="observations")
    nurse = db.relationship("Nurse")

    __table_args__ = (
        db.Index("idx_observations_assignment_recorded", "assignment_id", "recorded_at"),
    )

    def abnormal_vitals(self):
        """Labels of the vitals currently out of range, e.g. ['Temperature']."""
        flagged = []
        for field, low, high, label in VITAL_RANGES:
            value = getattr(self, field)
            if value is None:
                continue
            value = float(value)
            if (low is not None and value < low) or (high is not None and value > high):
                flagged.append(label)
        return flagged

    def evaluate(self):
        """Sets is_abnormal from the vitals plus any complication the nurse
        wrote down. Called before saving, never on read."""
        self.is_abnormal = bool(self.abnormal_vitals()) or bool(
            (self.complications or "").strip()
        )
        return self.is_abnormal

    def to_dict(self):
        return {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "recorded_at": to_utc_iso(self.recorded_at),
            "temperature_c": float(self.temperature_c) if self.temperature_c is not None else None,
            "pulse_bpm": self.pulse_bpm,
            "systolic_bp": self.systolic_bp,
            "diastolic_bp": self.diastolic_bp,
            "respiratory_rate": self.respiratory_rate,
            "spo2": self.spo2,
            "blood_sugar": float(self.blood_sugar) if self.blood_sugar is not None else None,
            "pain_score": self.pain_score,
            "symptoms": self.symptoms,
            "recovery_progress": self.recovery_progress,
            "complications": self.complications,
            "is_abnormal": self.is_abnormal,
            "abnormal_vitals": self.abnormal_vitals(),
            "nurse_id": self.nurse_id,
            "nurse": self.nurse.user.name if self.nurse and self.nurse.user else None,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<PatientObservation {self.id} assignment={self.assignment_id}>"
