
from portal.models.role import DOCTOR

# The shared machinery, and the reason this module is data plus a call rather
# than a second copy of the reconciliation logic. See the module docstring.
from portal.seeders.seed_accounts import (
    account_credentials,
    ensure_account,
    report_account,
)

DOCTOR_DEFAULTS = {
    "name": "Practice Doctor",
    "email": "goddumahesh2@gmail.com",
    "password": "Virat@100",
}


def doctor_credentials():
    """(name, email, password, is_default_password) for the doctor.

    The environment applied over `DOCTOR_DEFAULTS` -- SEED_DOCTOR_NAME,
    SEED_DOCTOR_EMAIL, SEED_DOCTOR_PASSWORD win where they are set, so a
    deployment need not edit this file to change the login.
    """
    return account_credentials(DOCTOR)


def ensure_doctor_account():
    """Creates the doctor account, or brings it in step with `DOCTOR_DEFAULTS`.

    Returns (user, created, changes) -- `changes` naming the fields actually
    written, which is empty on the common restart where nothing moved.

    Idempotent, and never creates a second doctor: `ensure_account` finds the
    existing one by role and rewrites it, so changing the email or password
    above moves the account that is already there.
    """
    return ensure_account(DOCTOR)


def run():
    """The `python -m portal.seeds` entry point. Reports to stdout."""
    return report_account(DOCTOR)


if __name__ == "__main__":
    # Standalone:  python -m portal.seeders.seed_doctor
    from portal import create_app
    from portal.seeders import seed_roles

    app = create_app()
    with app.app_context():
        print("Seeding the doctor account...")
        # The account needs its role to exist; seeding roles is additive and
        # safe to repeat, so this stays runnable on an empty database.
        seed_roles.run()
        run()
        print("Seed complete.")
