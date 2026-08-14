from datetime import datetime

from portal.extensions import db

# The five roles the application is built around. Every login belongs to
# exactly one of them (`users.role_id` is NOT NULL), and every access rule in
# the codebase is written against these names.
#
# Guaranteed to exist by a data migration rather than by the seeder: a fresh
# `flask db upgrade` has to leave a working database behind, and several
# routes (registration approval, nurse creation) look a role up by name and
# would fail against an empty table.
#
# Adding one here is not enough on its own -- it needs a migration to insert
# it, and helpers/decorators.py decides what it can actually reach.
DEFAULT_ROLES = (
    (
        "admin",
        "Full access. Manages staff accounts, departments and branches, "
        "approves registrations, and reads the audit trail.",
    ),
    (
        "doctor",
        "Runs consultations, verifies prescriptions, assigns nursing care and "
        "reviews the patients assigned to them.",
    ),
    (
        "nurse",
        "Records medication, vitals, observations and handovers for the "
        "patients a doctor has assigned to them.",
    ),
    (
        "receptionist",
        "Registers patients, keeps their details current, routes them to a "
        "doctor and manages the OP queue. No access to clinical records.",
    ),
    (
        "pharmacist",
        "Manages the medicine catalogue and their branch's stock, and looks "
        "up availability across other branches.",
    ),
    (
        "lab_technician",
        "Runs diagnostic tests for a lab department. No access to "
        "consultations, prescriptions or the nursing record.",
    ),
    (
        "accountant",
        "Handles billing and financial records. No access to clinical data.",
    ),
    (
        "other_staff",
        "General hospital staff with an account but no clinical or financial "
        "access — a placeholder for roles the hospital adds later.",
    ),
)

ROLE_NAMES = tuple(name for name, _description in DEFAULT_ROLES)

# How a role is written when a person reads it -- in the credentials email, in
# an audit line. Mirrors ROLE_LABELS in the frontend's StaffFormModal; keep the
# two in step. `role_label` falls back to title-casing the name, so a role
# added without a label here still reads sensibly.
ROLE_LABELS = {
    "admin": "Administrator",
    "doctor": "Doctor",
    "nurse": "Nurse",
    "receptionist": "Receptionist",
    "pharmacist": "Pharmacist",
    "lab_technician": "Lab Technician",
    "accountant": "Accountant",
    "other_staff": "Other Staff",
}


def role_label(name):
    """The human-readable name of a role."""
    return ROLE_LABELS.get(name) or (name or "").replace("_", " ").title() or "Staff"

# Roles an administrator may create through Staff Management. `admin` is
# absent: granting administrator is how every other grant is made, so it stays
# a deliberate database-level action rather than a form field.
STAFF_ROLES = tuple(name for name in ROLE_NAMES if name != "admin")

# Roles that own a dedicated profile table because clinical or pharmacy code
# joins against it — creating one of these must create that row too, or the
# account is half-formed. That costs more than it sounds: several scoping rules
# read "role X with no X profile" as unrestricted, so a doctor account with no
# doctor row can see every patient rather than none (see
# `helpers/patient_access.patient_scope`). `staff_routes` creates the account
# and its profile in one transaction for exactly this reason.
ROLES_WITH_PROFILE = ("doctor", "nurse", "pharmacist")


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    description = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    users = db.relationship("User", back_populates="role")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "user_count": len(self.users),
        }

    def __repr__(self):
        return f"<Role {self.name}>"
