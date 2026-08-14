"""CLI entry point: python -m portal.seeds

Seeds what every checkout needs to have in common:

    1. the default roles
    2. the default administrator account
    3. the hospital departments
    4. the starting clinical formulary
    5. the pharmacy brand catalogue

Order matters — an account cannot be created without its role, and a brand
cannot link to its department or its formulary generic before those exist.

The first four are also reconciled on every `python app.py` start (see
`helpers/bootstrap`), so this command is mostly for running them without
starting a server; the pharmacy brand catalogue — the medicine master data
developers used to insert into their own database by hand — is only ever
seeded here. Demo staff logins, patients and pharmacy stock are sample
content rather than reference data and are deliberately not seeded here;
`seeders/seed_core.py` still holds them if they are ever wanted back.

Safe to run more than once: roles and departments are only ever added, the
administrator is a single account that gets created or brought back in step
with the configured credentials (see `seeders/seed_admin`), and medicines —
formulary entries and pharmacy brands alike — are only ever inserted when
missing, never duplicated and never overwritten once they exist, so anything
a developer added or edited by hand is left alone.
"""

from portal import create_app
from portal.seeders import seed_admin, seed_departments, seed_medicines, seed_roles


def run():
    seed_roles.run()
    seed_admin.run()
    seed_departments.run()
    seed_medicines.run()


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        print("Seeding...")
        run()
        print("Seed complete.")
