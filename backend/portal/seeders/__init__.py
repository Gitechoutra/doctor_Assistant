"""Seeders, one module per thing being seeded.

Each exposes a `run()` that is safe to call repeatedly. `portal/seeds.py`
decides which ones run and in what order — the ordering matters, since the PA
and doctor accounts need their roles to exist first.
"""

from portal.seeders import seed_accounts, seed_medicines, seed_roles

__all__ = ["seed_roles", "seed_accounts", "seed_medicines"]
