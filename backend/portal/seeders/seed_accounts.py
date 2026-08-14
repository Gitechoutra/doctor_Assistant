"""The machinery a seeded staff account is made and kept in step with.

**Only the PA is seeded.** A practice is two people, but only one of them can
be created before anybody has signed in: the PA runs the desk, and the desk is
where the doctor's account comes from. There is no default doctor -- the one
that used to be written into this file meant every checkout came up as the
same fictional person, and a real practice's first job was to edit a row it
had never asked for. The PA creates the real doctor through "Add doctor" (see
`routes/doctor_routes.create_doctor`), using the details that doctor gives
them, and the account works the moment it is made.

So a fresh database comes up with a PA to sign in as and no doctor, which is
the honest state of a practice nobody has set up yet. `helpers/practice`
already answers "which doctor?" with None, and the screens that ask render it
as a prompt rather than an error.

**The PA's own defaults live in `seeders/seed_PA`**, which owns that account
end to end. What stays here is what makes an account and keeps it in step --
`ensure_account`, `_apply_configured_credentials`, `account_credentials` and
`report_account` -- so there is one implementation of the rule below rather
than one per role.

Configured from the environment, falling back to the documented defaults in
`seed_PA` so a fresh checkout works with no setup at all:

    SEED_PA_NAME / SEED_PA_EMAIL / SEED_PA_PASSWORD
    SEED_ACCOUNT_SYNC=false   leave existing accounts alone once created

The rule that matters, inherited from the administrator seeder this replaces:
**an account whose configured email has changed is moved, not duplicated.**
The account is found by its role, not by its address. Matching on email got
that case badly wrong -- it read a renamed account as an absent one and
created a second beside it, holding the default password from the repository.

`is_active` is never written. A disabled account is one somebody deliberately
switched off, and restarting the server must not switch it back on.
"""

import os

from portal.extensions import db
from portal.models.role import PA, Role
from portal.models.user import User

# No DEFAULTS table here any more. The PA's live in `seeders/seed_PA`, and the
# doctor has none by design -- see the module docstring.


def _defaults_for(role):
    """The configured defaults for one role.

    Imported inside the function rather than at module scope because `seed_PA`
    imports this module for the shared machinery below -- at module scope the
    two would form a cycle.
    """
    if role == PA:
        from portal.seeders.seed_PA import PA_DEFAULTS

        return PA_DEFAULTS
    raise KeyError(
        f"No seed defaults for the '{role}' role. Only the PA is seeded; a "
        f"doctor is created by the PA through POST /api/doctors."
    )


# Spellings of "no" accepted from the environment. Anything else — including
# an unset or empty value — leaves syncing on, so the documented default
# behaviour does not depend on remembering to set anything.
_FALSEY = {"0", "false", "no", "off"}


def _env(role, field, fallback):
    key = f"SEED_{'PA' if role == PA else 'DOCTOR'}_{field.upper()}"
    return (os.environ.get(key) or "").strip() or fallback


def account_credentials(role):
    """Returns (name, email, password, is_default_password) for one role."""
    defaults = _defaults_for(role)
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
    db.session.commit()
    return user, True, []


def report_account(role_name):
    """Seeds one role's account and prints what happened. Returns the user.

    Lives here rather than in `seed_PA` because it belongs with the machinery
    it reports on, and because a second seeded role would use it unchanged.
    """
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
    return user


# No `run()` here. This module seeds nothing on its own any more: the PA is
# `seeders/seed_PA.run()`, and the doctor is not seeded at all -- the PA
# creates them through the application. `portal/seeds.py` calls seed_PA
# directly.
