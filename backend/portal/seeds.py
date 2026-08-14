"""CLI entry point: python -m portal.seeds

Seeds what every checkout of MediAssist AI needs to have in common:

    1. the two roles — PA and doctor
    2. the PA's account
    3. the starting clinical formulary
    4. the prescribing catalogue

Order matters — an account cannot be created without its role, and a brand
cannot link to its formulary generic before that exists.

**No doctor is seeded.** The `doctor` role exists from step 1, but the account
holding it does not: the practice's real doctor is created by the PA through
"Add doctor" (`POST /api/doctors`), from the details that doctor gives them.
A default doctor written into the repository meant every checkout came up as
the same fictional person.

All four are also reconciled on every `python app.py` start (see
`helpers/bootstrap`), so this command is mostly for running them without
starting a server.

Safe to run more than once: roles are only ever added or have their wording
refreshed, the two accounts are created or brought back in step with the
configured credentials (see `seeders/seed_accounts`), and medicines are only
ever inserted when missing — never duplicated and never overwritten once they
exist, so anything added or edited by hand is left alone.
"""

from portal import create_app
from portal.seeders import seed_medicines, seed_PA, seed_roles


def run():
    seed_roles.run()
    # The PA, and only the PA. There is no default doctor -- the PA creates the
    # practice's real one through "Add doctor" once they have signed in.
    seed_PA.run()
    seed_medicines.run()


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        print("Seeding...")
        run()
        print("Seed complete.")
