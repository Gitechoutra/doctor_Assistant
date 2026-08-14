"""Generic HR details for any member of staff.

One row per staff account, holding the fields every role shares plus the
handful each role adds. Deliberately separate from the clinical profile tables
(`doctors`, `nurses`, `pharmacists`), which exist because consultations,
nursing assignments and stock all hold foreign keys into them and cannot be
disturbed.

The split is worth stating plainly:

  * `doctors` / `nurses` / `pharmacists` -- *operational* identity. What the
    clinical code joins on. Narrow and stable.
  * `staff_profiles` -- *HR* identity. Everything an administrator types into
    the staff form. Wide, and expected to change.

That is what makes this module replaceable. When the hospital's real
onboarding process turns up, it will change what an administrator records
about a person -- not how a consultation finds its doctor. Only this table
moves.

`extra` is the escape hatch: a JSON column for fields a client asks for that
do not warrant a migration. Anything queried or reported on should graduate to
a real column.
"""

from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

GENDERS = ("male", "female", "other")

# Suggested per role by the UI, stored as free text. A hospital that calls the
# grade something else should not need a migration to say so.
DESIGNATIONS = {
    "doctor": ("Intern", "Junior Doctor", "Senior Doctor", "Consultant"),
    "nurse": ("Junior Nurse", "Senior Nurse"),
    "receptionist": ("Front Desk Executive", "Senior Receptionist"),
    "pharmacist": ("Pharmacist", "Chief Pharmacist"),
    "lab_technician": ("Lab Technician", "Senior Lab Technician"),
    "accountant": ("Accounts Executive", "Senior Accountant"),
    "other_staff": (),
}

SHIFTS = ("morning", "evening", "night")


class StaffProfile(db.Model):
    __tablename__ = "staff_profiles"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )

    # -- common to every role ------------------------------------------------
    phone = db.Column(db.String(20), nullable=True)
    gender = db.Column(db.Enum(*GENDERS, name="staff_gender"), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    # Nullable on purpose: an accountant or a general staff member may not
    # belong to a clinical department at all.
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    # Where a pharmacist works, and useful for any role once the hospital runs
    # more than one site.
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"), nullable=True)
    designation = db.Column(db.String(100), nullable=True)
    # Reserved for the hospital-generated employee IDs the brief mentions as
    # future scope. Unique when present, so it can become a login handle later
    # without a data cleanup first.
    employee_code = db.Column(db.String(50), nullable=True, unique=True)
    joined_on = db.Column(db.Date, nullable=True)

    # -- role-specific, kept sparse rather than in six small tables ----------
    # One registration column covers medical, nursing and pharmacy councils:
    # they are the same fact with a different issuing body, and splitting them
    # would mean three nullable columns that are never populated together.
    registration_no = db.Column(db.String(60), nullable=True)
    specialization = db.Column(db.String(150), nullable=True)
    years_experience = db.Column(db.Integer, nullable=True)
    shift = db.Column(db.Enum(*SHIFTS, name="staff_shift"), nullable=True)
    lab_department = db.Column(db.String(120), nullable=True)
    qualification = db.Column(db.String(150), nullable=True)

    notes = db.Column(db.Text, nullable=True)
    # Fields a client asks for that do not yet justify a migration.
    extra = db.Column(db.JSON, nullable=True)

    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = db.relationship("User", back_populates="staff_profile")
    department = db.relationship("Department")
    branch = db.relationship("Branch")

    __table_args__ = (db.Index("idx_staff_employee_code", "employee_code"),)

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        today = datetime.utcnow().date()
        return (
            today.year
            - self.date_of_birth.year
            - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))
        )

    def to_dict(self):
        return {
            "phone": self.phone,
            "gender": self.gender,
            "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
            "age": self.age,
            "department_id": self.department_id,
            "department": self.department.name if self.department else None,
            "branch_id": self.branch_id,
            "branch": self.branch.name if self.branch else None,
            "designation": self.designation,
            "employee_code": self.employee_code,
            "joined_on": self.joined_on.isoformat() if self.joined_on else None,
            "registration_no": self.registration_no,
            "specialization": self.specialization,
            "years_experience": self.years_experience,
            "shift": self.shift,
            "lab_department": self.lab_department,
            "qualification": self.qualification,
            "notes": self.notes,
            "extra": self.extra or {},
            "updated_at": to_utc_iso(self.updated_at),
        }

    def __repr__(self):
        return f"<StaffProfile user={self.user_id}>"
