"""Prepare the database the browser pass signs into, and report its logins.

Runs against **`doctor_test`**, never the practice's own database. The browser
pass drives the real interface with a real session, which means it writes:
signing in alone stamps the audit trail. Pointing that at live records would
leave fixture accounts and stray rows among a real practice's data, so this
uses the same testing database the two backend suites use, derived by
`TestingConfig` by suffixing the configured name.

`db.create_all()` and nothing destructive. When the suites have just run, the
schema is already there and populated -- patients, appointments, a finished
consultation -- and the browser pass gets realistic screens to render rather
than a set of empty states, which is where the interesting rendering bugs
live. When they have not, this makes an empty schema that still boots.

Prints the credentials as JSON on the last line. The doctor's come from the
seeder, so the pass signs in as whoever this deployment actually seeded rather
than as a hardcoded guess. There is no seeded PA -- the doctor creates the
desk's accounts and that route emails the password rather than returning it --
so one is made here as a fixture, exactly as both suites do.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/backend")
os.environ["APP_ENV"] = "testing"

from portal import create_app  # noqa: E402
from portal.extensions import db  # noqa: E402

PA_EMAIL = "verify.desk@gmail.com"
PA_PASSWORD = "Desk@12345"

# First pass: build the schema. Bootstrap runs inside create_app and is
# non-fatal, so on an empty database its checks simply report nothing to do.
app = create_app("testing")
with app.app_context():
    db.create_all()

# Second pass, now the tables exist, so the roles, the doctor's account and
# the formulary are seeded into them. The suites use the same two-step.
app = create_app("testing")

with app.app_context():
    from portal.models.role import PA as PA_ROLE, Role
    from portal.models.user import User
    from portal.seeders.seed_doctor import doctor_credentials

    _name, doctor_email, doctor_password, _default = doctor_credentials()

    pa = User.query.filter_by(email=PA_EMAIL).first()
    if not pa:
        pa_role = Role.query.filter_by(name=PA_ROLE).first()
        pa = User(
            name="Verify Desk",
            username="verify.desk",
            email=PA_EMAIL,
            role_id=pa_role.id,
        )
        pa.set_password(PA_PASSWORD)
        db.session.add(pa)
        db.session.commit()
    else:
        # Kept in step in case an earlier run left it with another password.
        pa.set_password(PA_PASSWORD)
        db.session.commit()

    print("---JSON---")
    print(
        json.dumps(
            {
                "doctor": {"email": doctor_email, "password": doctor_password},
                "pa": {"email": PA_EMAIL, "password": PA_PASSWORD},
            }
        )
    )
