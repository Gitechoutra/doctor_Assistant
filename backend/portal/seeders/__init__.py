"""Seeders, one module per thing being seeded.

Each exposes a `run()` that is safe to call repeatedly. `portal/seeds.py`
decides which ones run and in what order — the ordering matters, since the PA
and doctor accounts need their roles to exist first.
"""

from portal.seeders import seed_accounts, seed_medicines, seed_roles

# `seed_PA` is deliberately NOT imported here. It is runnable on its own with
# `python -m portal.seeders.seed_PA`, and importing it eagerly would load it
# twice under that command -- once as `portal.seeders.seed_PA` and again as
# `__main__` -- which Python warns about. `from portal.seeders import seed_PA`
# still works: Python falls back to importing the submodule.
__all__ = ["seed_roles", "seed_PA", "seed_accounts", "seed_medicines"]
