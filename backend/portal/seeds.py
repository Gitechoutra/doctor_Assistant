"""CLI entry point: python -m portal.seeds

Seeds what every checkout of MediAssist AI needs to have in common:

    1. the two roles — PA and doctor
    2. the doctor's account, and the practice profile that goes with it
    3. the starting clinical formulary
    4. the prescribing catalogue

Order matters — an account cannot be created without its role, and a brand
cannot link to its formulary generic before that exists.

**No PA is seeded.** The `pa` role exists from step 1, but the account holding
it does not: the desk's accounts are created by the doctor through
"Assistants" (`POST /api/pas`), which issues each PA their own credentials.
The doctor is the one account a checkout has to come up with, because without
it there is nobody to sign in as.

All four are also reconciled on every `python app.py` start (see
`helpers/bootstrap`), so this command is mostly for running them without
starting a server.

Safe to run more than once: roles are only ever added or have their wording
refreshed, the doctor's account is created or brought back in step with the
configured credentials (see `seeders/seed_accounts`), and medicines are only
ever inserted when missing — never duplicated and never overwritten once they
exist, so anything added or edited by hand is left alone.
"""

from portal import create_app
from portal.seeders import seed_doctor, seed_medicines, seed_roles


def run():
    seed_roles.run()
    # The doctor, and only the doctor. There is no default PA -- the doctor
    # creates the desk's accounts through "Assistants" once they have signed
    # in. Re-running this moves the existing doctor account to whatever
    # `seeders/seed_doctor.DOCTOR_DEFAULTS` now says; it never adds a second.
    seed_doctor.run()
    seed_medicines.run()


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        print("Seeding...")
        run()
        print("Seed complete.")
