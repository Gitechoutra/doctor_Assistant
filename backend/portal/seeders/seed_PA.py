"""The practice assistant's account.

The PA is one half of a two-person practice: the person who registers
patients, books the appointments and runs the queue the doctor consults from.
There is no Staff Management screen to create them from -- a two-person
practice does not need one -- so the account is reconciled from here, and
again on every start (see `helpers/bootstrap.ensure_accounts`). A fresh
database or a restored dump therefore comes up with a PA to sign in as.

**This module owns the PA's seed data and nothing else owns it.** Change
`PA_DEFAULTS` below, run the seed, and the existing account is brought in step
-- name, email and password all follow. The account is found by its *role*,
not by its address, so a changed email moves the account it already has rather
than creating a second one beside it holding the password from this file.

What this module deliberately does *not* re-implement: the reconciliation
itself. `ensure_account`, `_apply_configured_credentials` and the uniqueness
checks live in `seeders/seed_accounts` and are shared with the doctor's
account. There is one implementation of "an account whose configured email has
changed is moved, not duplicated", and both staff roles get it.

Configured from the environment, falling back to the defaults below so a fresh
checkout works with no setup at all:

    SEED_PA_NAME / SEED_PA_EMAIL / SEED_PA_PASSWORD
    SEED_ACCOUNT_SYNC=false   leave the account alone once it exists

`is_active` is never written. A disabled account is one somebody deliberately
switched off, and re-running this must not switch it back on.

Run it:
    python -m portal.seeders.seed_PA
"""

from portal.models.role import PA

# The shared machinery, and the reason this module is data plus a call rather
# than a second copy of the reconciliation logic. See the module docstring.
from portal.seeders.seed_accounts import (
    account_credentials,
    ensure_account,
    report_account,
)

# ---------------------------------------------------------------------------
# THE PA'S DEFAULT SEED DATA
#
# Edit here and re-run: `ensure_account` compares each field against the
# account on file and writes back the ones that differ. The stored password is
# *asked* rather than replaced -- the hash is salted, so rewriting it every run
# would churn the row and report a password change on every boot.
#
# Overridden per-deployment by SEED_PA_NAME / SEED_PA_EMAIL / SEED_PA_PASSWORD.
# ---------------------------------------------------------------------------
PA_DEFAULTS = {
    "name": "Practice Assistant",
    "email": "goddumahesh2@gmail.com",
    "password": "PA@12345",
}


def pa_credentials():
    """(name, email, password, is_default_password) for the PA.

    The environment applied over `PA_DEFAULTS`, same as the doctor's.
    """
    return account_credentials(PA)


def ensure_pa_account():
    """Creates the PA account, or brings it in step with `PA_DEFAULTS`.

    Returns (user, created, changes) -- `changes` naming the fields actually
    written, which is empty on the common restart where nothing moved.

    Idempotent, and never creates a second PA: `ensure_account` finds the
    existing one by role.
    """
    return ensure_account(PA)


def run():
    """The `python -m portal.seeds` entry point. Reports to stdout."""
    return report_account(PA)


if __name__ == "__main__":
    # Standalone:  python -m portal.seeders.seed_PA
    from portal import create_app
    from portal.seeders import seed_roles

    app = create_app()
    with app.app_context():
        print("Seeding the PA account...")
        # The account needs its role to exist; seeding roles is additive and
        # safe to repeat, so this stays runnable on an empty database.
        seed_roles.run()
        run()
        print("Seed complete.")
