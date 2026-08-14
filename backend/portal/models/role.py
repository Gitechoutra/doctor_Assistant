from datetime import datetime

from portal.extensions import db

# The two roles this application has, and the only two it may ever have
# without a deliberate change here.
#
# A private practice is two people: the doctor, and the assistant who runs the
# desk for them. Every access rule in the codebase is written against these
# names -- see `helpers/decorators`, which is the single place that decides
# what each one can reach.
#
# `users.role_id` is NOT NULL and several routes look a role up by name, so
# both rows are reconciled at every start by `helpers/bootstrap.ensure_roles`:
# a fresh database, or one restored from a dump, comes up usable.
PA = "pa"
DOCTOR = "doctor"

DEFAULT_ROLES = (
    (
        PA,
        "Personal Assistant. Registers patients, books and reschedules "
        "appointments, runs the day's queue, and reads the practice's records. "
        "No clinical authority.",
    ),
    (
        DOCTOR,
        "The practice's doctor. Runs consultations, records diagnoses and "
        "clinical notes, prescribes, and issues reports.",
    ),
)

ROLE_NAMES = tuple(name for name, _description in DEFAULT_ROLES)

# How a role is written when a person reads it -- in the credentials email, in
# an audit line. "PA" stays upper-case: it is an abbreviation, and the
# title-casing fallback below would render it "Pa".
ROLE_LABELS = {
    PA: "PA",
    DOCTOR: "Doctor",
}


def role_label(name):
    """The human-readable name of a role."""
    return ROLE_LABELS.get(name) or (name or "").replace("_", " ").title() or "Staff"


# Roles that own a dedicated profile table because clinical code joins against
# it -- creating one of these must create that row too, or the account is
# half-formed. `doctor` is the only one left: the PA has no clinical record of
# their own, so their user row is the whole account.
ROLES_WITH_PROFILE = (DOCTOR,)


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
            "label": role_label(self.name),
            "description": self.description,
            "user_count": len(self.users),
        }

    def __repr__(self):
        return f"<Role {self.name}>"
