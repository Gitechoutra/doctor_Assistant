"""The two accounts a practice cannot start without: the PA and the doctor.

A practice is two people, and neither can be created from inside the
application -- there is no Staff Management screen to make them from, because
a two-person practice does not need one. So they are reconciled here, and
again on every start (see `helpers/bootstrap.ensure_accounts`), which means a
fresh database or a restored dump comes up with something to sign in as.

Both accounts are configured from the environment, and both fall back to a
documented default so a fresh checkout works with no setup at all:

    SEED_PA_NAME / SEED_PA_EMAIL / SEED_PA_PASSWORD
    SEED_DOCTOR_NAME / SEED_DOCTOR_EMAIL / SEED_DOCTOR_PASSWORD
    SEED_DOCTOR_SPECIALIZATION / SEED_DOCTOR_REGISTRATION_NO
    SEED_ACCOUNT_SYNC=false   leave existing accounts alone once created

The rule that matters, inherited from the administrator seeder this replaces:
**an account whose configured email has changed is moved, not duplicated.**
Each account is found by its role, not by its address. Matching on email got
that case badly wrong -- it read a renamed account as an absent one and
created a second beside it, holding the default password from the repository.

`is_active` is never written. A disabled account is one somebody deliberately
switched off, and restarting the server must not switch it back on.

The doctor's account additionally gets its `doctors` row, in the same
transaction. A doctor user with no doctor profile is a half-formed account:
`helpers/practice.practice_doctor` would find nobody, so nothing could be
booked, and every patient scoping rule would read the account as the PA.
"""

import os

from portal.extensions import db
from portal.models.doctor import Doctor
from portal.models.role import DOCTOR, PA, Role
from portal.models.user import User

DEFAULTS = {
    PA: {
        "name": "Practice Assistant",
        "email": "pa@mediassist.local",
        "password": "PA@12345",
    },
    DOCTOR: {
        "name": "Dr. Ramana Muddada",
        "email": "doctor@mediassist.local",
        "password": "Doctor@12345",
    },
}

DEFAULT_SPECIALIZATION = "General Medicine"
DEFAULT_QUALIFICATION = "MBBS, MD"

# Spellings of "no" accepted from the environment. Anything else — including
# an unset or empty value — leaves syncing on, so the documented default
# behaviour does not depend on remembering to set anything.
_FALSEY = {"0", "false", "no", "off"}


def _env(role, field, fallback):
    key = f"SEED_{'PA' if role == PA else 'DOCTOR'}_{field.upper()}"
    return (os.environ.get(key) or "").strip() or fallback


def account_credentials(role):
    """Returns (name, email, password, is_default_password) for one role."""
    defaults = DEFAULTS[role]
    name = _env(role, "name", defaults["name"])
    email = _env(role, "email", defaults["email"]).lower()
    password = os.environ.get(
        f"SEED_{'PA' if role == PA else 'DOCTOR'}_PASSWORD"
    ) or defaults["password"]
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
        _ensure_doctor_profile(existing, role_name)
        return existing, False, changes

    clash = User.query.filter_by(email=email).first()
    if clash:
        raise RuntimeError(
            f"Cannot create the {role_name} account: {email} is already used by "
            f"the {clash.role.name if clash.role else 'unknown'} account."
        )

    user = User(name=name, email=email, role_id=role.id)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()  # assigns user.id for the profile below
    _ensure_doctor_profile(user, role_name)
    db.session.commit()
    return user, True, []


def _ensure_doctor_profile(user, role_name):
    """The `doctors` row a doctor account is meaningless without.

    Additive: an existing profile keeps whatever the doctor has since set on
    their own profile page. Only the missing row is created.
    """
    if role_name != DOCTOR:
        return None
    profile = Doctor.query.filter_by(user_id=user.id).first()
    if profile:
        return profile
    profile = Doctor(
        user_id=user.id,
        specialization=(
            os.environ.get("SEED_DOCTOR_SPECIALIZATION") or DEFAULT_SPECIALIZATION
        ),
        qualification=DEFAULT_QUALIFICATION,
        registration_no=(os.environ.get("SEED_DOCTOR_REGISTRATION_NO") or "").strip() or None,
    )
    db.session.add(profile)
    return profile


def run():
    """The `python -m portal.seeds` entry point. Reports to stdout."""
    results = []
    for role_name in (PA, DOCTOR):
        _n, _e, _p, is_default_password = account_credentials(role_name)
        user, created, changes = ensure_account(role_name)
        label = "PA" if role_name == PA else "Doctor"
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
        results.append(user)
    return results
