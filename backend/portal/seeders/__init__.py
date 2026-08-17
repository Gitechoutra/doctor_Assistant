"""Seeders, one module per thing being seeded.

Each exposes a `run()` that is safe to call repeatedly. `portal/seeds.py`
decides which ones run and in what order — the ordering matters, since the
doctor's account needs its role to exist first.

The PA is not among them: no default assistant is seeded, and the desk's real
accounts are created by the doctor through the application.
"""

from portal.seeders import seed_medicines, seed_roles

# `seed_accounts` is not a seeder any more -- it is the machinery `seed_doctor`
# makes its account with, and it seeds nothing on its own. Imported where it is
# used rather than re-exported here.

# `seed_doctor` is deliberately NOT imported here. It is runnable on its own
# with `python -m portal.seeders.seed_doctor`, and importing it eagerly would
# load it twice under that command -- once as `portal.seeders.seed_doctor` and
# again as `__main__` -- which Python warns about. `from portal.seeders import
# seed_doctor` still works: Python falls back to importing the submodule.
__all__ = ["seed_roles", "seed_doctor", "seed_accounts", "seed_medicines"]
