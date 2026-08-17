
import os

from portal.extensions import db
from portal.models.doctor import DEFAULT_SPECIALIZATION, Doctor
from portal.models.role import DOCTOR, ROLES_WITH_PROFILE, Role, role_label
from portal.models.user import User

# No DEFAULTS table here any more. The doctor's live in `seeders/seed_doctor`,
# and the PA has none by design -- see the module docstring.


def _defaults_for(role):
    """The configured defaults for one role.

    Imported inside the function rather than at module scope because
    `seed_doctor` imports this module for the shared machinery below -- at
    module scope the two would form a cycle.
    """
    if role == DOCTOR:
        from portal.seeders.seed_doctor import DOCTOR_DEFAULTS

        return DOCTOR_DEFAULTS
    raise KeyError(
        f"No seed defaults for the '{role}' role. Only the doctor is seeded; a "
        f"PA is created by the doctor through POST /api/pas."
    )


_FALSEY = {"0", "false", "no", "off"}


def _env_key(role, field):
    """SEED_DOCTOR_EMAIL, SEED_DOCTOR_PASSWORD, ...

    Derived from the role name rather than spelled out per role, so a second
    seeded role needs nothing added here.
    """
    return f"SEED_{(role or '').upper()}_{field.upper()}"


def _env(role, field, fallback):
    return (os.environ.get(_env_key(role, field)) or "").strip() or fallback


def account_credentials(role):
    """Returns (name, email, password, is_default_password) for one role."""
    defaults = _defaults_for(role)
    name = _env(role, "name", defaults["name"])
    email = _env(role, "email", defaults["email"]).lower()
    password = os.environ.get(_env_key(role, "password")) or defaults["password"]
    return name, email, password, password == defaults["password"]


def sync_enabled():
    """Whether an existing account is rewritten to match the configuration."""
    return (os.environ.get("SEED_ACCOUNT_SYNC") or "").strip().lower() not in _FALSEY


def _apply_configured_credentials(user, name, email, password):
    """Rewrites `user` to match the configuration. Returns what changed.

    The returned list names the fields actually written — empty when the
    account already agreed with the configuration, which is the common case on
    a restart and the reason this does not commit unconditionally.
    """
    if not sync_enabled():
        return []

    # `users.email` is unique, so a clash is reported before anything is
    # written rather than left to surface as an IntegrityError on commit.
    if user.email != email:
        clash = User.query.filter(User.email == email, User.id != user.id).first()
        if clash:
            raise RuntimeError(
                f"Cannot move this account to {email}: that address already belongs "
                f"to the {clash.role.name if clash.role else 'unknown'} account."
            )

    changes = []
    if user.name != name:
        user.name = name
        changes.append("name")
    if user.email != email:
        user.email = email
        changes.append("email")
    # Asked of the stored hash rather than replaced outright: the hash is
    # salted, so rewriting it every boot would churn `updated_at` and report a
    # password change on every restart even when nothing moved.
    if not user.check_password(password):
        user.set_password(password)
        changes.append("password")

    if changes:
        db.session.commit()
    return changes


def _ensure_profile(user, role_name):
    """Gives the account the profile row its role requires, if it lacks one.

    `doctor` is the only role with one (`models/role.ROLES_WITH_PROFILE`), and
    a doctor with no `doctors` row is a half-formed account: `practice_doctor`
    would not find them, so nothing could be booked, no consultation could name
    them, and every "which doctor?" screen would render as though the practice
    had none. `POST /api/doctors` makes that row in the same transaction as the
    account; the seeded doctor arrives by a different door, so it is made here.

    Additive, like everything else a restart runs: an existing profile is left
    exactly as it is. The specialization, qualification and practice name are
    the doctor's own — they are printed on every prescription and report — and
    resetting them at each boot would undo an edit nobody asked to undo.
    """
    if role_name not in ROLES_WITH_PROFILE or user.doctor_profile:
        return False

    db.session.add(Doctor(user_id=user.id, specialization=DEFAULT_SPECIALIZATION))
    db.session.commit()
    return True


def ensure_account(role_name):
    """Creates the account for one role, or brings it in step with the config.

    Returns (user, created, changes).
    """
    name, email, password, _is_default = account_credentials(role_name)

    role = Role.query.filter_by(name=role_name).first()
    if not role:
        # Say so plainly rather than failing on a NoneType attribute below.
        raise RuntimeError(
            f"The '{role_name}' role does not exist. Run the roles seeder first."
        )

    # Oldest first, so the account reported back is stable across restarts
    # rather than whichever row the database happened to return.
    existing = User.query.filter_by(role_id=role.id).order_by(User.id).first()
    if existing:
        changes = _apply_configured_credentials(existing, name, email, password)
        _ensure_profile(existing, role_name)
        return existing, False, changes

    clash = User.query.filter_by(email=email).first()
    if clash:
        raise RuntimeError(
            f"Cannot create the {role_name} account: {email} is already used by "
            f"the {clash.role.name if clash.role else 'unknown'} account. Give "
            f"the {role_name} a different address, or remove that account."
        )

    user = User(name=name, email=email, role_id=role.id)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    _ensure_profile(user, role_name)
    return user, True, []


def report_account(role_name):
    """Seeds one role's account and prints what happened. Returns the user.

    Lives here rather than in `seed_doctor` because it belongs with the
    machinery it reports on, and because a second seeded role would use it
    unchanged.
    """
    _n, _e, _p, is_default_password = account_credentials(role_name)
    user, created, changes = ensure_account(role_name)
    label = role_label(role_name)
    if created:
        print(f"  {label:<11} -> created {user.email}")
        if is_default_password:
            print(
                "                 WARNING: using the default password. Set "
                f"SEED_{label.upper()}_PASSWORD, or change it after first sign-in."
            )
    elif changes:
        print(f"  {label:<11} -> updated {user.email} ({', '.join(changes)})")
    else:
        print(f"  {label:<11} -> already exists ({user.email}), left untouched")
    if not user.is_active:
        print(
            "                 NOTE: that account is disabled. Re-enable it in "
            "the database if you are locked out."
        )
    return user


# No `run()` here. This module seeds nothing on its own any more: the doctor is
# `seeders/seed_doctor.run()`, and the PA is not seeded at all -- the doctor
# creates them through the application. `portal/seeds.py` calls seed_doctor
# directly.
