"""Seeders, one module per thing being seeded.

Each exposes a `run()` that is safe to call repeatedly. `portal/seeds.py`
decides which ones run and in what order — the ordering matters, since the
admin account needs its role to exist first.
"""

from portal.seeders import seed_admin, seed_departments, seed_medicines, seed_roles

__all__ = ["seed_roles", "seed_admin", "seed_departments", "seed_medicines"]
