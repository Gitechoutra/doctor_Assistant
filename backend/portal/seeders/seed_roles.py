"""Seeds the roles every login is assigned one of.

`users.role_id` is NOT NULL and several routes look a role up by name, so
this is the one seeder that has to run before any other — an admin account
cannot be created until the `admin` role exists.

The list itself lives in `models/role.DEFAULT_ROLES`, not here. That module is
what the authorization code is written against, so keeping the names in one
place means adding a role is a single edit rather than two that can disagree.

Related but not the same thing: `helpers/bootstrap.ensure_roles` runs this
same reconciliation at application start. That one is additive-only and never
raises, because it runs on every boot. This one is a deliberate, explicit
command, so it also refreshes descriptions — editing the wording in
DEFAULT_ROLES and re-seeding is how you push that change out.
"""

from portal.extensions import db
from portal.models.role import DEFAULT_ROLES, Role


def run():
    """Creates any missing role and refreshes the descriptions of the rest.

    Idempotent: running it twice changes nothing the second time. Returns the
    names it created, so the caller can report them.
    """
    created = []

    for name, description in DEFAULT_ROLES:
        role = Role.query.filter_by(name=name).first()
        if role:
            role.description = description
        else:
            db.session.add(Role(name=name, description=description))
            created.append(name)

    db.session.commit()

    if created:
        print(f"  Roles       -> added {len(created)}: {', '.join(created)}")
    else:
        print(f"  Roles       -> all {len(DEFAULT_ROLES)} already present")

    return created
