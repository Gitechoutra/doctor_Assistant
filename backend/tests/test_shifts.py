"""Every route in the shift module, exercised end to end.

    cd backend && python tests/test_shifts.py

Runs against the **test** database — TestingConfig points at `<DB_NAME>_test`,
which this creates if it is missing, drops and rebuilds on every run, and
fills with its own staff. It cannot touch the live schema: the assertion below
refuses to start if the URL is not the test one.

Plain asserts and a pass/fail tally rather than pytest, which is not in
requirements.txt — this has to be runnable on a fresh checkout with nothing
installed beyond what the application itself needs.

What it covers: creating one day and a range, the slot/hours rules, every
validation refusal, clash detection across midnight, all-or-nothing range
writes, read scoping per role, the options payload, notifications, update,
cancel, restore and delete, the four write permissions, and that the doctor
availability endpoint reads the same rows.
"""

import os
import sys
from datetime import date, timedelta

# Run as a script from backend/, so the package root has to be importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["APP_ENV"] = "testing"

import sqlalchemy as sa
from flask_jwt_extended import create_access_token

from config.config import TestingConfig, _VALUES, _build_database_url
from portal import create_app
from portal.extensions import db
from portal.models.department import Department
from portal.models.notification import Notification
from portal.models.role import DEFAULT_ROLES, Role
from portal.models.staff_shift import StaffShift
from portal.models.user import User

PASSES, FAILS = [], []


def check(label, condition, detail=""):
    (PASSES if condition else FAILS).append(label)
    print(f"  {'PASS' if condition else 'FAIL'}  {label}{(' — ' + str(detail)) if detail and not condition else ''}")


# -- the test database has to exist before SQLAlchemy can connect to it -------
#
# Dropped and recreated rather than emptied with `db.drop_all()`. drop_all only
# knows the tables the models currently declare, so a table left behind by an
# older revision of the schema survives it -- and then blocks the run, because
# its foreign keys still point at tables drop_all is trying to remove. (That is
# not hypothetical: `registration_requests` did exactly this after its model
# was deleted.) Recreating the schema makes the starting state depend on the
# models alone, which is the only state a test run should ever begin from.
root_url = _build_database_url(_VALUES["DB_NAME"])
test_name = f"{_VALUES['DB_NAME']}_test"
# Checked before any DDL runs, not after the app is built: this statement drops
# a whole database, so the name is verified here rather than trusted.
assert test_name.endswith("_test"), f"refusing to drop {test_name!r}"
engine = sa.create_engine(root_url.split("?")[0])
with engine.connect() as conn:
    conn.execute(sa.text(f"DROP DATABASE IF EXISTS `{test_name}`"))
    conn.execute(sa.text(f"CREATE DATABASE `{test_name}` "
                         "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
    conn.commit()
engine.dispose()

app = create_app("testing")
print("running against:", app.config["SQLALCHEMY_DATABASE_URI"].split("@")[-1])
assert app.config["SQLALCHEMY_DATABASE_URI"].endswith(
    f"{test_name}?charset=utf8mb4"
), "refusing to run outside the test database"

with app.app_context():
    db.create_all()
    for name, description in DEFAULT_ROLES:
        db.session.add(Role(name=name, description=description))
    db.session.flush()
    dept = Department(name="Cardiology")
    db.session.add(dept)

    def mk(name, role):
        u = User(name=name, email=f"{name.lower()}@gmail.com", username=name.lower(),
                 role_id=Role.query.filter_by(name=role).first().id)
        u.set_password("Password@123")
        db.session.add(u)
        return u

    admin, nurse, doctor, disabled = (
        mk("adminuser", "admin"), mk("nurseuser", "nurse"),
        mk("docuser", "doctor"), mk("goneuser", "nurse"),
    )
    disabled.is_active = False
    db.session.commit()
    ids = {"admin": admin.id, "nurse": nurse.id, "doctor": doctor.id,
           "disabled": disabled.id, "dept": dept.id}
    tokens = {
        r: create_access_token(identity=str(ids[r]), additional_claims={"role": role})
        for r, role in (("admin", "admin"), ("nurse", "nurse"), ("doctor", "doctor"))
    }

c = app.test_client()
H = {r: {"Authorization": f"Bearer {t}"} for r, t in tokens.items()}
today = date.today()
iso = lambda d: d.isoformat()  # noqa: E731

print("\n== create ==")
r = c.post("/api/shifts", json={"user_id": ids["nurse"], "from_date": iso(today),
                                "slot": "morning"}, headers=H["admin"])
check("single-day create returns 201", r.status_code == 201, r.get_json())
one = r.get_json()["data"]["items"][0]
check("slot defaults fill the hours", (one["starts_at"], one["ends_at"]) == ("06:00", "14:00"),
      (one["starts_at"], one["ends_at"]))
check("message is singular", r.get_json()["message"] == "Shift added", r.get_json()["message"])

r = c.post("/api/shifts", json={"user_id": ids["doctor"], "from_date": iso(today + timedelta(days=1)),
                                "to_date": iso(today + timedelta(days=5)), "slot": "evening",
                                "department_id": ids["dept"], "notes": "Ward B cover"},
           headers=H["admin"])
body = r.get_json()
check("range create writes one row per day", r.get_json()["data"]["count"] == 5, body)
check("range message is plural", body["message"] == "5 shifts added", body["message"])
check("department is stored", body["data"]["items"][0]["department"] == "Cardiology")

r = c.post("/api/shifts", json={"from_date": iso(today), "slot": "night"}, headers=H["admin"])
check("unassigned slot is allowed", r.status_code == 201 and
      r.get_json()["data"]["items"][0]["assigned"] is False)
night = r.get_json()["data"]["items"][0]
check("night shift is flagged as crossing midnight", night["crosses_midnight"] is True)

print("\n== validation ==")
cases = [
    ({"user_id": ids["nurse"], "from_date": iso(today), "slot": "sleeping"}, 422, "bad slot"),
    ({"user_id": ids["nurse"], "slot": "morning"}, 422, "missing date"),
    ({"user_id": ids["nurse"], "from_date": "11-08-2026", "slot": "morning"}, 422, "bad date format"),
    ({"user_id": ids["nurse"], "from_date": iso(today + timedelta(days=5)),
      "to_date": iso(today), "slot": "morning"}, 422, "to before from"),
    ({"user_id": ids["nurse"], "from_date": iso(today),
      "to_date": iso(today + timedelta(days=200)), "slot": "morning"}, 422, "range too long"),
    ({"user_id": ids["nurse"], "from_date": iso(today), "slot": "custom"}, 422, "custom needs hours"),
    ({"user_id": ids["nurse"], "from_date": iso(today), "slot": "custom",
      "starts_at": "09:00", "ends_at": "09:00"}, 422, "zero-length shift"),
    ({"user_id": ids["disabled"], "from_date": iso(today), "slot": "morning"}, 422, "disabled staff"),
    ({"user_id": ids["admin"], "from_date": iso(today), "slot": "morning"}, 422, "admin not schedulable"),
    ({"user_id": 99999, "from_date": iso(today), "slot": "morning"}, 422, "unknown user"),
    ({"user_id": ids["nurse"], "from_date": iso(today), "slot": "morning",
      "department_id": 4242}, 422, "unknown department"),
]
for payload, expected, label in cases:
    r = c.post("/api/shifts", json=payload, headers=H["admin"])
    check(f"rejects {label}", r.status_code == expected, f"{r.status_code} {r.get_json().get('message')}")

print("\n== clash detection ==")
r = c.post("/api/shifts", json={"user_id": ids["nurse"], "from_date": iso(today),
                                "slot": "custom", "starts_at": "10:00", "ends_at": "12:00"},
           headers=H["admin"])
check("overlapping shift is refused with 409", r.status_code == 409, r.get_json().get("message"))
check("409 names the clashing shift", r.get_json().get("errors", {}).get("shift_id") == one["id"])

r = c.post("/api/shifts", json={"user_id": ids["nurse"], "from_date": iso(today),
                                "slot": "evening"}, headers=H["admin"])
check("non-overlapping same-day shift is allowed", r.status_code == 201, r.get_json().get("message"))
evening_id = r.get_json()["data"]["items"][0]["id"] if r.status_code == 201 else None

# A night shift yesterday runs into this morning.
c.post("/api/shifts", json={"user_id": ids["doctor"], "from_date": iso(today - timedelta(days=1)),
                            "slot": "night"}, headers=H["admin"])
r = c.post("/api/shifts", json={"user_id": ids["doctor"], "from_date": iso(today), "slot": "custom",
                                "starts_at": "05:00", "ends_at": "08:00"}, headers=H["admin"])
check("yesterday's night shift blocks this morning", r.status_code == 409,
      f"{r.status_code} {r.get_json().get('message')}")

r = c.post("/api/shifts", json={"user_id": ids["doctor"], "from_date": iso(today), "slot": "custom",
                                "starts_at": "07:00", "ends_at": "09:00"}, headers=H["admin"])
check("a start after that night shift ends is allowed", r.status_code == 201,
      f"{r.status_code} {r.get_json().get('message')}")

print("\n== range create is all-or-nothing ==")
before = None
with app.app_context():
    before = StaffShift.query.count()
r = c.post("/api/shifts", json={"user_id": ids["nurse"], "from_date": iso(today - timedelta(days=2)),
                                "to_date": iso(today + timedelta(days=2)), "slot": "morning"},
           headers=H["admin"])
with app.app_context():
    after = StaffShift.query.count()
check("a range that clashes on one day writes nothing",
      r.status_code == 409 and after == before, f"{r.status_code}, {before} -> {after}")

print("\n== reading and scoping ==")
r = c.get("/api/shifts", headers=H["admin"])
check("admin sees everyone", r.status_code == 200 and
      len({s["user_id"] for s in r.get_json()["data"]["items"]}) > 1)
check("admin gets can_manage true", r.get_json()["data"]["can_manage"] is True)

r = c.get(f"/api/shifts?user_id={ids['doctor']}", headers=H["nurse"])
items = r.get_json()["data"]["items"]
check("a nurse asking for someone else's shifts gets only her own",
      all(s["user_id"] == ids["nurse"] for s in items), items)
check("non-admin gets can_manage false", r.get_json()["data"]["can_manage"] is False)

r = c.get("/api/shifts/mine", headers=H["doctor"])
check("/mine returns only the caller's",
      all(s["user_id"] == ids["doctor"] for s in r.get_json()["data"]["items"]))

r = c.get(f"/api/shifts?user_id=unassigned", headers=H["admin"])
check("unassigned filter works",
      all(s["assigned"] is False for s in r.get_json()["data"]["items"]))

r = c.get("/api/shifts?role=nurse", headers=H["admin"])
check("role filter works",
      all(s["staff_role"] == "nurse" for s in r.get_json()["data"]["items"]))

r = c.get("/api/shifts?from=2026-13-45", headers=H["admin"])
check("a bad from date is a 422", r.status_code == 422)
r = c.get("/api/shifts?from=2020-01-01&to=2026-01-01", headers=H["admin"])
check("an over-long window is a 422", r.status_code == 422)

r = c.get(f"/api/shifts/{one['id']}", headers=H["doctor"])
check("another person's shift reads as 404, not 403", r.status_code == 404)

r = c.get("/api/shifts/options", headers=H["admin"])
opts = r.get_json()["data"]
check("options lists assignable staff", {s["id"] for s in opts["staff"]} >= {ids["nurse"], ids["doctor"]})
check("options excludes the admin", ids["admin"] not in {s["id"] for s in opts["staff"]})
check("options excludes disabled staff", ids["disabled"] not in {s["id"] for s in opts["staff"]})
check("options carries slot hours", opts["slot_hours"]["night"]["starts_at"] == "22:00")
check("options is admin-only", c.get("/api/shifts/options", headers=H["nurse"]).status_code == 403)

print("\n== notifications ==")
with app.app_context():
    notes = Notification.query.filter_by(user_id=ids["doctor"], category="shift").all()
    check("the assignee is told", len(notes) >= 1, len(notes))
    check("a range is one notification, not five",
          any("5 new shifts" in n.title for n in notes), [n.title for n in notes])
    check("nobody else is told",
          Notification.query.filter_by(user_id=ids["admin"], category="shift").count() == 0)

print("\n== update, cancel, restore, delete ==")
r = c.patch(f"/api/shifts/{one['id']}", json={"notes": "swapped"}, headers=H["admin"])
check("edit keeps hand-set hours", r.status_code == 200 and
      (r.get_json()["data"]["starts_at"], r.get_json()["data"]["ends_at"]) == ("06:00", "14:00"))

r = c.patch(f"/api/shifts/{one['id']}", json={"slot": "night"}, headers=H["admin"])
check("changing the slot re-times the shift",
      (r.get_json()["data"]["starts_at"], r.get_json()["data"]["ends_at"]) == ("22:00", "06:00"),
      r.get_json()["data"])

# The nurse now genuinely holds a night shift today (the slot change above
# re-timed hers to 22:00-06:00), so assigning her a second one must clash.
r = c.patch(f"/api/shifts/{night['id']}", json={"user_id": ids["nurse"]}, headers=H["admin"])
check("assigning into an hour the person already works is refused", r.status_code == 409,
      f"{r.status_code} {r.get_json().get('message')}")

# ... and onto a free night it works.
r = c.post("/api/shifts", json={"from_date": iso(today + timedelta(days=60)), "slot": "night"},
           headers=H["admin"])
free_slot = r.get_json()["data"]["items"][0]["id"]
r = c.patch(f"/api/shifts/{free_slot}", json={"user_id": ids["nurse"]}, headers=H["admin"])
check("assigning an open slot works", r.status_code == 200 and r.get_json()["data"]["assigned"] is True,
      r.get_json().get("message"))
check("assigning an open slot keeps its hours",
      (r.get_json()["data"]["starts_at"], r.get_json()["data"]["ends_at"]) == ("22:00", "06:00"),
      r.get_json()["data"])

r = c.post(f"/api/shifts/{one['id']}/cancel", headers=H["admin"])
check("cancel keeps the row", r.status_code == 200 and r.get_json()["data"]["status"] == "cancelled")
r = c.post(f"/api/shifts/{one['id']}/cancel", headers=H["admin"])
check("cancelling twice is idempotent", r.status_code == 200)
r = c.patch(f"/api/shifts/{one['id']}", json={"status": "scheduled"}, headers=H["admin"])
check("a cancelled shift can be put back", r.get_json()["data"]["status"] == "scheduled",
      r.get_json().get("message"))

r = c.delete(f"/api/shifts/{evening_id}", headers=H["admin"])
check("delete removes it", r.status_code == 200)
check("deleting it again is a 404",
      c.delete(f"/api/shifts/{evening_id}", headers=H["admin"]).status_code == 404)

print("\n== permissions ==")
for label, call in [
    ("create", lambda h: c.post("/api/shifts", json={"from_date": iso(today), "slot": "morning"}, headers=h)),
    ("update", lambda h: c.patch(f"/api/shifts/{one['id']}", json={"notes": "x"}, headers=h)),
    ("cancel", lambda h: c.post(f"/api/shifts/{one['id']}/cancel", headers=h)),
    ("delete", lambda h: c.delete(f"/api/shifts/{one['id']}", headers=h)),
]:
    check(f"a nurse cannot {label}", call(H["nurse"]).status_code == 403)
check("an anonymous caller cannot read", c.get("/api/shifts").status_code == 401)

print("\n== doctor availability reads the same data ==")
r = c.get(f"/api/doctors/availability?date={iso(today)}", headers=H["admin"])
check("availability endpoint answers", r.status_code == 200, r.get_json())
if r.status_code == 200:
    data = r.get_json()["data"]
    check("it uses the renamed count key", "scheduled_count" in data, list(data))
    check("no 'rostered' vocabulary is left in the payload",
          "rostered" not in str(data).lower())

print(f"\n{len(PASSES)} passed, {len(FAILS)} failed")
if FAILS:
    print("FAILED:")
    for f in FAILS:
        print("  -", f)

print("\n== slot/hours interaction (regression) ==")
r = c.post("/api/shifts", json={"user_id": ids["nurse"], "from_date": iso(today + timedelta(days=40)),
                                "slot": "morning"}, headers=H["admin"])
sid = r.get_json()["data"]["items"][0]["id"]

r = c.patch(f"/api/shifts/{sid}", json={"slot": "night"}, headers=H["admin"])
d = r.get_json()["data"]
check("slot change re-times the shift", (d["starts_at"], d["ends_at"]) == ("22:00", "06:00"), d)

r = c.patch(f"/api/shifts/{sid}", json={"starts_at": "23:15", "ends_at": "05:45"}, headers=H["admin"])
d = r.get_json()["data"]
check("explicit hours win", (d["starts_at"], d["ends_at"]) == ("23:15", "05:45"), d)

r = c.patch(f"/api/shifts/{sid}", json={"notes": "unchanged slot"}, headers=H["admin"])
d = r.get_json()["data"]
check("editing notes leaves hand-tuned hours alone", (d["starts_at"], d["ends_at"]) == ("23:15", "05:45"), d)

r = c.patch(f"/api/shifts/{sid}", json={"slot": "custom"}, headers=H["admin"])
d = r.get_json()["data"]
check("moving to custom keeps the current hours", (d["starts_at"], d["ends_at"]) == ("23:15", "05:45"), d)

r = c.patch(f"/api/shifts/{sid}", json={"slot": "morning", "starts_at": "07:30"}, headers=H["admin"])
d = r.get_json()["data"]
check("a half-given time fills the rest from the slot",
      (d["starts_at"], d["ends_at"]) == ("07:30", "14:00"), d)

print(f"\nFINAL: {len(PASSES)} passed, {len(FAILS)} failed")
for f in FAILS:
    print("  FAILED:", f)
