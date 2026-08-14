"""What the nurse has to give, and the log of each time they gave it.

`MedicationOrder` is the schedule — one row per drug the doctor wants
administered during the observation period, usually imported straight from
the consultation's prescription. `MedicationAdministration` is the record of
a single dose, and it is append-only: a nurse adds an entry, nobody rewrites
one, so the log stands as an audit trail.
"""

from datetime import datetime

from portal.extensions import db
from portal.models.types import PRECISE_DATETIME, PRECISE_TIMESTAMP
from portal.helpers.datetime_helper import to_utc_iso

ROUTES = ("oral", "injection", "iv", "topical", "inhalation", "other")
ADMIN_STATUSES = ("completed", "delayed", "missed", "skipped")

# Route labels the UI shows; kept beside the enum so the two can't drift.
ROUTE_LABELS = {
    "oral": "Tablet / Oral",
    "injection": "Injection",
    "iv": "IV / Saline",
    "topical": "Topical",
    "inhalation": "Inhalation",
    "other": "Other",
}


class MedicationOrder(db.Model):
    __tablename__ = "medication_orders"

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("nursing_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True)
    medicine_name = db.Column(db.String(150), nullable=False)
    route = db.Column(db.Enum(*ROUTES, name="medication_route"), nullable=False, default="oral")
    # Free text, sized to match generated_prescriptions — these are usually
    # copied from there verbatim.
    dose = db.Column(db.String(255), nullable=True)
    frequency = db.Column(db.String(255), nullable=True)
    duration = db.Column(db.String(255), nullable=True)
    instructions = db.Column(db.Text, nullable=True)
    # How many doses a full day should have. Drives the "3 of 4 doses logged
    # today" reading on both dashboards; null means as-needed (PRN), which is
    # never counted as behind schedule.
    times_per_day = db.Column(db.Integer, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(
        PRECISE_TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow
    )

    assignment = db.relationship("NursingAssignment", back_populates="medication_orders")
    medicine = db.relationship("Medicine")
    administrations = db.relationship(
        "MedicationAdministration",
        back_populates="order",
        order_by="MedicationAdministration.created_at.desc()",
    )

    @property
    def route_label(self):
        return ROUTE_LABELS.get(self.route, self.route)

    def to_dict(self):
        return {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "medicine_name": self.medicine_name,
            "route": self.route,
            "route_label": self.route_label,
            "dose": self.dose,
            "frequency": self.frequency,
            "duration": self.duration,
            "instructions": self.instructions,
            "times_per_day": self.times_per_day,
            "is_active": self.is_active,
            "matched_formulary": self.medicine_id is not None,
        }

    def __repr__(self):
        return f"<MedicationOrder {self.medicine_name}>"


class MedicationAdministration(db.Model):
    __tablename__ = "medication_administrations"

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("nursing_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Null for a one-off dose given outside the standing orders (PRN painkiller,
    # emergency saline). The name below is always populated either way.
    order_id = db.Column(
        db.Integer, db.ForeignKey("medication_orders.id", ondelete="SET NULL"), nullable=True
    )
    nurse_id = db.Column(db.Integer, db.ForeignKey("nurses.id"), nullable=False)

    # Snapshot of what was given. Copied rather than read through order_id so
    # editing or deactivating an order can never rewrite history.
    medicine_name = db.Column(db.String(150), nullable=False)
    route = db.Column(db.Enum(*ROUTES, name="medication_route"), nullable=False, default="oral")
    dose = db.Column(db.String(255), nullable=True)

    # When it was due vs. when it actually happened — the gap between the two
    # is what makes "delayed" meaningful.
    scheduled_at = db.Column(PRECISE_DATETIME, nullable=True)
    administered_at = db.Column(PRECISE_DATETIME, nullable=True)
    status = db.Column(
        db.Enum(*ADMIN_STATUSES, name="medication_admin_status"), nullable=False
    )
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        PRECISE_TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow
    )

    assignment = db.relationship("NursingAssignment", back_populates="administrations")
    order = db.relationship("MedicationOrder", back_populates="administrations")
    nurse = db.relationship("Nurse")

    __table_args__ = (
        db.Index("idx_med_admin_assignment_created", "assignment_id", "created_at"),
    )

    @property
    def route_label(self):
        return ROUTE_LABELS.get(self.route, self.route)

    @property
    def delay_minutes(self):
        """How late the dose was, or None when either time is missing."""
        if not self.scheduled_at or not self.administered_at:
            return None
        return int((self.administered_at - self.scheduled_at).total_seconds() // 60)

    def to_dict(self):
        return {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "order_id": self.order_id,
            "medicine_name": self.medicine_name,
            "route": self.route,
            "route_label": self.route_label,
            "dose": self.dose,
            "status": self.status,
            "scheduled_at": to_utc_iso(self.scheduled_at),
            "administered_at": to_utc_iso(self.administered_at),
            "delay_minutes": self.delay_minutes,
            "notes": self.notes,
            "nurse_id": self.nurse_id,
            "nurse": self.nurse.user.name if self.nurse and self.nurse.user else None,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<MedicationAdministration {self.medicine_name} {self.status}>"
