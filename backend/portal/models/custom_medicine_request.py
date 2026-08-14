"""Medicines doctors had to write by hand, queued for the pharmacy to consider.

A doctor is never blocked by the catalogue: if the medicine they need is not
in it, they enter it manually and finish the prescription. That freedom has a
cost — the catalogue stops describing what is actually being prescribed — and
this table is how the cost gets paid back. Each hand-entered medicine becomes
a request the pharmacy can review and, if it belongs there, add permanently.

One row per medicine name rather than per prescription. Five doctors writing
the same missing drug is one decision for the pharmacist, not five, and the
count is itself the evidence that it belongs in the catalogue.

Requests are raised when a prescription is *finalized*, not when it is drafted:
a medicine the doctor typed and then removed before signing off was never
prescribed, and should not become work for anyone.
"""

from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

STATUSES = ("pending", "added", "dismissed")


def normalise_name(name):
    """The key requests are grouped by.

    Case and spacing only — no attempt to equate "Vitamin D3 60000" with
    "Cholecalciferol 60000". Guessing that two differently-written names are
    the same medicine is exactly the judgement the pharmacist is being asked
    to make, and getting it wrong here would silently merge two requests.
    """
    return " ".join((name or "").strip().lower().split())


class CustomMedicineRequest(db.Model):
    __tablename__ = "custom_medicine_requests"

    id = db.Column(db.Integer, primary_key=True)
    normalized_name = db.Column(db.String(150), nullable=False, unique=True)
    # As the first doctor wrote it, so the pharmacist sees real clinical
    # wording rather than the lowercased key.
    medicine_name = db.Column(db.String(150), nullable=False)
    strength = db.Column(db.String(80), nullable=True)
    route = db.Column(db.String(20), nullable=True)
    # The dosing the doctor prescribed, kept as a starting point for the
    # catalogue entry rather than as a rule — it is one prescription's dosing,
    # not the medicine's standing instructions.
    dose = db.Column(db.String(255), nullable=True)
    frequency = db.Column(db.String(255), nullable=True)
    instructions = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    # Who has needed it, and how often — what tells a pharmacist whether this
    # is a one-off or a genuine gap in the catalogue.
    times_prescribed = db.Column(db.Integer, nullable=False, default=0)
    first_requested_at = db.Column(db.DateTime, nullable=True)
    last_requested_at = db.Column(db.DateTime, nullable=True)
    requested_by_doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)

    # Indexed (added via a raw migration, not this flag originally — declared
    # here too so `flask db migrate` sees it and stops proposing to drop it).
    status = db.Column(
        db.Enum(*STATUSES, name="custom_medicine_request_status"),
        nullable=False,
        default="pending",
        index=True,
    )
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    review_note = db.Column(db.String(255), nullable=True)
    # The catalogue entry this became, when the pharmacy accepted it.
    created_brand_id = db.Column(
        db.Integer, db.ForeignKey("medicine_brands.id"), nullable=True
    )

    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    doctor = db.relationship("Doctor")
    department = db.relationship("Department")
    reviewer = db.relationship("User")
    created_brand = db.relationship("MedicineBrand")

    def to_dict(self):
        return {
            "id": self.id,
            "medicine_name": self.medicine_name,
            "strength": self.strength,
            "route": self.route,
            "dose": self.dose,
            "frequency": self.frequency,
            "instructions": self.instructions,
            "notes": self.notes,
            "times_prescribed": self.times_prescribed,
            "first_requested_at": to_utc_iso(self.first_requested_at),
            "last_requested_at": to_utc_iso(self.last_requested_at),
            "requested_by": self.doctor.user.name
            if self.doctor and self.doctor.user
            else None,
            "department_id": self.department_id,
            "department": self.department.name if self.department else None,
            "status": self.status,
            "reviewed_by": self.reviewer.name if self.reviewer else None,
            "reviewed_at": to_utc_iso(self.reviewed_at),
            "review_note": self.review_note,
            "created_brand_id": self.created_brand_id,
        }

    def __repr__(self):
        return f"<CustomMedicineRequest {self.medicine_name} {self.status}>"
