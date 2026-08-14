"""Seeds the hospital's departments.

The list lives in `models/department.DEFAULT_DEPARTMENTS`, not here — that is
what doctors, appointments and the department-wise pharmacy inventory are all
written against.

Matched on name, which is the natural key: `departments.name` is unique, so a
department that already exists is skipped rather than inserted again. Nothing
existing is renamed or removed, including departments a hospital has added
itself — this only ever tops the table up.
"""

from portal.extensions import db
from portal.models.department import DEFAULT_DEPARTMENTS, Department


def run():
    """Creates any missing department. Returns the names it created."""
    existing = {name for (name,) in db.session.query(Department.name).all()}
    missing = [name for name in DEFAULT_DEPARTMENTS if name not in existing]

    for name in missing:
        db.session.add(Department(name=name))
    if missing:
        db.session.commit()

    if missing:
        print(f"  Departments -> added {len(missing)}: {', '.join(missing)}")
    else:
        print(f"  Departments -> all {len(DEFAULT_DEPARTMENTS)} already present")

    return missing
