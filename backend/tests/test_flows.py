"""Every major user flow, end to end, across all seven roles.

    cd backend && python tests/test_flows.py

Runs against the **test** database — TestingConfig points at `<DB_NAME>_test`,
which this creates if it is missing, drops and rebuilds on every run. It
cannot touch the live schema: the assertion below refuses to start if the URL
is not the test one.

Plain asserts and a pass/fail tally rather than pytest, matching test_shifts.py
— this has to be runnable on a fresh checkout with nothing installed beyond
what the application itself needs.

What it covers, in the order a hospital day actually runs:

  registration    reception registers a patient and routes them to a doctor
  queue           an OP is raised, the doctor calls the patient in
  emergency       an arrival who cannot wait is logged, claimed and resolved
  consultation    the session records, ends, and produces a prescription
  case            sessions gather under one case; sign-off locks the script
  surgery         the doctor marks, completes and discharges the pathway
  nursing         hand-off, medication orders, doses, observations, alerts
  lab             a test is ordered, collected, resulted and verified
  pharmacy        the formulary, stock, and the low-stock/expiry views
  staff           an admin creates, edits, disables and deletes an account
  access          the authorization boundary for every role on every module
"""

import os
import sys
from datetime import date, datetime, timedelta

# Run as a script from backend/, so the package root has to be importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["APP_ENV"] = "testing"

import sqlalchemy as sa
from flask_jwt_extended import create_access_token

from config.config import _VALUES, _build_database_url
from portal import create_app
from portal.extensions import db
from portal.models.branch import Branch
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.medicine import Medicine
from portal.models.nurse import Nurse
from portal.models.pharmacist import Pharmacist
from portal.models.role import DEFAULT_ROLES, Role
from portal.models.user import User

PASSES, FAILS, SKIPS = [], [], []

# Ending a consultation calls Gemini to write the summary, so that one step —
# and everything downstream of it — depends on an external service with a daily
# free-tier quota. When the quota is spent the API answers 429, and 502/503 mean
# it is unreachable or erroring.
#
# Those are reported as skipped rather than failed. A red suite has to mean
# "this code is broken"; a suite that goes red because somebody else's daily
# allowance ran out trains you to ignore it, which costs more than the coverage
# it was protecting. The skips are counted and listed at the end, so a run that
# could not exercise the AI path never passes silently for it either.
AI_UNAVAILABLE = (429, 502, 503)


def check(label, condition, detail=""):
    (PASSES if condition else FAILS).append(label)
    print(
        f"  {'PASS' if condition else 'FAIL'}  {label}"
        f"{(' — ' + str(detail)) if detail and not condition else ''}"
    )


def skip(label, why):
    SKIPS.append(label)
    print(f"  SKIP  {label} — {why}")


def section(title):
    print(f"\n== {title} ==")


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
    conn.execute(
        sa.text(
            f"CREATE DATABASE `{test_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
    )
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

    cardiology = Department(name="Cardiology")
    ortho = Department(name="Orthopaedics")
    db.session.add_all([cardiology, ortho])
    branch = Branch(name="Main Pharmacy", code="MAIN")
    db.session.add(branch)
    db.session.flush()

    def mk(name, role):
        user = User(
            name=name,
            email=f"{name.lower()}@gmail.com",
            username=name.lower(),
            role_id=Role.query.filter_by(name=role).first().id,
        )
        user.set_password("Password@123")
        db.session.add(user)
        return user

    admin = mk("adminuser", "admin")
    doctor_u = mk("docuser", "doctor")
    other_doctor_u = mk("otherdoc", "doctor")
    homeless_doctor_u = mk("nodeptdoc", "doctor")
    nurse_u = mk("nurseuser", "nurse")
    reception_u = mk("deskuser", "receptionist")
    pharmacist_u = mk("pharmuser", "pharmacist")
    labtech_u = mk("labuser", "lab_technician")
    accountant_u = mk("acctuser", "accountant")
    db.session.flush()

    doctor = Doctor(user_id=doctor_u.id, department_id=cardiology.id, specialization="Cardiology")
    other_doctor = Doctor(user_id=other_doctor_u.id, department_id=ortho.id)
    # No department: there is no queue to admit a patient into, so registering
    # against them has to be refused rather than half-done.
    homeless_doctor = Doctor(user_id=homeless_doctor_u.id)
    nurse = Nurse(user_id=nurse_u.id, department_id=cardiology.id)
    pharmacist = Pharmacist(user_id=pharmacist_u.id, branch_id=branch.id)
    db.session.add_all([doctor, other_doctor, homeless_doctor, nurse, pharmacist])

    db.session.add_all(
        [
            Medicine(name="Paracetamol", category="Analgesic"),
            Medicine(name="Amoxicillin", category="Antibiotic"),
        ]
    )
    db.session.commit()

    ids = {
        "admin": admin.id,
        "doctor": doctor_u.id,
        "other_doctor": other_doctor_u.id,
        "nurse": nurse_u.id,
        "reception": reception_u.id,
        "pharmacist": pharmacist_u.id,
        "labtech": labtech_u.id,
        "accountant": accountant_u.id,
        "doctor_profile": doctor.id,
        "other_doctor_profile": other_doctor.id,
        "homeless_doctor_profile": homeless_doctor.id,
        "nurse_profile": nurse.id,
        "cardiology": cardiology.id,
        "ortho": ortho.id,
        "branch": branch.id,
    }

    ROLE_OF = {
        "admin": "admin",
        "doctor": "doctor",
        "other_doctor": "doctor",
        "nurse": "nurse",
        "reception": "receptionist",
        "pharmacist": "pharmacist",
        "labtech": "lab_technician",
        "accountant": "accountant",
    }
    tokens = {
        key: create_access_token(identity=str(ids[key]), additional_claims={"role": role})
        for key, role in ROLE_OF.items()
    }

c = app.test_client()
H = {key: {"Authorization": f"Bearer {t}"} for key, t in tokens.items()}
ALL_ROLES = list(ROLE_OF)
today = date.today()


def body(resp):
    try:
        return resp.get_json()
    except Exception:  # noqa: BLE001
        return {"<non-json>": resp.data[:200]}


def data_of(resp):
    return (body(resp) or {}).get("data")


def msg(resp):
    return (body(resp) or {}).get("message")


# ---------------------------------------------------------------------------
section("registration — the front desk admits a patient")
# ---------------------------------------------------------------------------

r = c.post(
    "/api/patients",
    json={
        "name": "Arjun Rao",
        "gender": "male",
        "dob": "1990-04-12",
        "phone": "9876543210",
        "email": "arjun.rao@gmail.com",
        "blood_group": "o+",
        "allergies": "Penicillin",
        "assigned_doctor_id": ids["doctor_profile"],
    },
    headers=H["reception"],
)
check("reception can register a patient", r.status_code == 201, body(r))
patient = data_of(r) or {}
patient_id = patient.get("id")
check("blood group is normalised to O+", patient.get("blood_group") == "O+", patient.get("blood_group"))
check("a patient code is issued", bool(patient.get("code")), patient.get("code"))
check("age is derived from the dob", isinstance(patient.get("age"), int), patient.get("age"))

# -- registration raises the OP in the same act ----------------------------
#
# The desk registers somebody who is standing in front of them, so the queue
# entry is part of admitting them rather than a second screen to remember.
auto_op = patient.get("appointment") or {}
check("registration returns the OP it raised", bool(auto_op.get("id")), patient)
check("the OP is waiting", auto_op.get("status") == "waiting", auto_op.get("status"))
check(
    "the OP is queued to the chosen doctor's department",
    auto_op.get("department_id") == ids["cardiology"],
    auto_op,
)
check("a first-ever OP is billed as paid", auto_op.get("patient_op_status") == "paid", auto_op)
# The doctor is on the OP itself, not only on the patient behind it -- reception
# chose them when it raised the OP, so the row records it from the start rather
# than waiting for somebody to press Start.
check(
    "the OP is assigned to the chosen doctor",
    auto_op.get("doctor_id") == ids["doctor_profile"],
    auto_op,
)

r = c.get("/api/appointments", headers=H["doctor"])
queue = data_of(r) or []
queue = queue if isinstance(queue, list) else queue.get("items", [])
check(
    "it is in the treating doctor's queue immediately",
    any(a.get("patient_id") == patient_id for a in queue),
    queue,
)

r = c.get("/api/appointments", headers=H["other_doctor"])
other_queue = data_of(r) or []
other_queue = other_queue if isinstance(other_queue, list) else other_queue.get("items", [])
check(
    "it is not in another department's queue",
    all(a.get("patient_id") != patient_id for a in other_queue),
    other_queue,
)

r = c.get("/api/notifications", headers=H["doctor"])
notes = data_of(r) or []
notes = notes if isinstance(notes, list) else notes.get("items", [])
check(
    "the treating doctor is notified of the new OP",
    any("queue" in (n.get("title") or "").lower() for n in notes),
    notes,
)

# Registering does not also need an OP raised by hand -- doing so within the
# duplicate window is the double-registration the queue already refuses.
r = c.post(
    "/api/appointments",
    json={"patient_id": patient_id, "department_id": ids["cardiology"]},
    headers=H["reception"],
)
check("raising a second OP straight away is refused", r.status_code == 409, msg(r))

r = c.post("/api/patients", json={"name": "No Doctor"}, headers=H["reception"])
check("registration without a doctor is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/patients",
    json={"name": "Future Baby", "dob": "2999-01-01", "assigned_doctor_id": ids["doctor_profile"]},
    headers=H["reception"],
)
check("a future date of birth is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/patients",
    json={"name": "Ancient One", "dob": "0001-01-01", "assigned_doctor_id": ids["doctor_profile"]},
    headers=H["reception"],
)
check("an impossible date of birth is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/patients",
    json={"name": "Bad Doctor", "assigned_doctor_id": 999999},
    headers=H["reception"],
)
check("an unknown doctor is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/patients",
    json={"name": "Nowhere To Go", "assigned_doctor_id": ids["homeless_doctor_profile"]},
    headers=H["reception"],
)
check("a doctor with no department is refused", r.status_code == 422, msg(r))
with app.app_context():
    from portal.models.patient import Patient as _P

    orphan = _P.query.filter_by(name="Nowhere To Go").first()
check("that refusal wrote no patient row", orphan is None, orphan)

for role in ("admin", "doctor", "nurse", "pharmacist", "labtech", "accountant"):
    r = c.post(
        "/api/patients",
        json={"name": "Nope", "assigned_doctor_id": ids["doctor_profile"]},
        headers=H[role],
    )
    check(f"{role} cannot register a patient", r.status_code == 403, r.status_code)

# ---------------------------------------------------------------------------
section("patient record — who may read and edit it")
# ---------------------------------------------------------------------------

r = c.get(f"/api/patients/{patient_id}", headers=H["doctor"])
check("the treating doctor sees the patient", r.status_code == 200, body(r))

r = c.get(f"/api/patients/{patient_id}", headers=H["other_doctor"])
check("another doctor gets 404, not 403", r.status_code == 404, r.status_code)

r = c.patch(f"/api/patients/{patient_id}", json={"allergies": "Penicillin, Sulfa"}, headers=H["doctor"])
check("the treating doctor can correct the record", r.status_code == 200, msg(r))

r = c.patch(f"/api/patients/{patient_id}", json={"name": "X"}, headers=H["nurse"])
check("a nurse cannot edit registration details", r.status_code == 403, r.status_code)

for role in ("pharmacist", "labtech", "accountant"):
    r = c.patch(f"/api/patients/{patient_id}", json={"name": "Hijacked"}, headers=H[role])
    check(f"{role} cannot edit registration details", r.status_code == 403, f"{r.status_code} {msg(r)}")

r = c.patch(f"/api/patients/{patient_id}", json={"gender": "martian"}, headers=H["reception"])
check("an invalid gender is refused", r.status_code == 422, msg(r))

r = c.patch(f"/api/patients/{patient_id}", json={"phone": "12"}, headers=H["reception"])
check("a malformed phone number is refused", r.status_code == 422, msg(r))

r = c.delete(f"/api/patients/{patient_id}/photo", headers=H["accountant"])
check("an accountant cannot remove a patient photo", r.status_code == 403, r.status_code)

r = c.patch(
    f"/api/patients/{patient_id}/assignment",
    json={"assigned_doctor_id": ids["other_doctor_profile"]},
    headers=H["doctor"],
)
check("a doctor cannot re-route a patient", r.status_code == 403, r.status_code)

r = c.patch(
    f"/api/patients/{patient_id}/assignment",
    json={"assigned_doctor_id": ids["doctor_profile"]},
    headers=H["reception"],
)
check("the front desk can re-route a patient", r.status_code == 200, msg(r))

r = c.get("/api/patients/counts", headers=H["doctor"])
counts = data_of(r) or {}
check("counts add up for the treating doctor", counts.get("total") == 1, counts)

r = c.get("/api/patients?scope=awaiting", headers=H["doctor"])
check("a never-consulted patient is 'awaiting'", len(data_of(r) or []) == 1, data_of(r))

r = c.get("/api/patients?scope=nonsense", headers=H["doctor"])
check("an unknown scope is refused", r.status_code == 422, msg(r))

r = c.get("/api/patients?scope=all&search=Arjun", headers=H["doctor"])
check("search finds the patient by name", len(data_of(r) or []) == 1, data_of(r))

r = c.get(f"/api/patients?scope=all&search={patient.get('code')}", headers=H["doctor"])
check("search finds the patient by their code", len(data_of(r) or []) == 1, data_of(r))

r = c.get("/api/patients?scope=all&search=Penicillin", headers=H["doctor"])
check("search does not reach into the allergies", len(data_of(r) or []) == 0, data_of(r))

r = c.get("/api/patients?scope=all&search=Arjun", headers=H["other_doctor"])
check("search does not widen a doctor's reach", len(data_of(r) or []) == 0, data_of(r))

# ---------------------------------------------------------------------------
section("the queue — an OP is raised and the patient is called in")
# ---------------------------------------------------------------------------

# The OP this patient is called in on is the one registration raised — the
# desk does not raise a second.
appointment = auto_op
appointment_id = appointment.get("id")

r = c.post("/api/appointments", json={"patient_id": patient_id, "department_id": 99999}, headers=H["reception"])
check("an unknown department is refused", r.status_code in (404, 422), r.status_code)

# A follow-up OP for a patient already on file is still raised by hand from
# Appointments — registration is a one-off, revisits are not.
r = c.post(
    "/api/patients",
    json={"name": "Returning Patient", "assigned_doctor_id": ids["doctor_profile"]},
    headers=H["reception"],
)
returning_id = (data_of(r) or {}).get("id")
with app.app_context():
    # Moved outside the ten-minute duplicate window, which is what separates a
    # genuine second visit from the desk pressing the button twice.
    from portal.models.appointment import Appointment as _Appt

    for row in _Appt.query.filter_by(patient_id=returning_id).all():
        row.created_at = datetime.utcnow() - timedelta(minutes=30)
    db.session.commit()

r = c.post(
    "/api/appointments",
    json={"patient_id": returning_id, "department_id": ids["cardiology"], "reason": "Follow-up"},
    headers=H["reception"],
)
check("a later follow-up OP can still be raised by hand", r.status_code == 201, body(r))
check(
    "a follow-up inside the window is not billed again",
    (data_of(r) or {}).get("patient_op_status") == "free",
    data_of(r),
)

r = c.post(
    "/api/appointments",
    json={"patient_id": returning_id, "department_id": ids["ortho"]},
    headers=H["reception"],
)
check(
    "an OP in a department other than the doctor's is refused",
    r.status_code == 422,
    msg(r),
)

r = c.post(f"/api/appointments/{appointment_id}/start", headers=H["nurse"])
check("a nurse cannot start a consultation", r.status_code == 403, r.status_code)

r = c.post(f"/api/appointments/{appointment_id}/start", headers=H["other_doctor"])
check("a doctor in another department cannot start it", r.status_code == 403, r.status_code)

r = c.post(f"/api/appointments/{appointment_id}/start", headers=H["doctor"])
check("the treating doctor starts the consultation", r.status_code == 200, body(r))
consultation = data_of(r) or {}
consultation_id = consultation.get("id")
check("the session opens in progress", consultation.get("status") == "in_progress", consultation.get("status"))

r = c.post(f"/api/appointments/{appointment_id}/start", headers=H["doctor"])
check("starting again resumes the same session", (data_of(r) or {}).get("id") == consultation_id, body(r))

r = c.get("/api/patients?scope=awaiting", headers=H["doctor"])
check(
    "a patient in the room is still 'awaiting'",
    any(p.get("id") == patient_id for p in (data_of(r) or [])),
    data_of(r),
)

# ---------------------------------------------------------------------------
section("emergency — the parallel entry point for an arrival who cannot wait")
# ---------------------------------------------------------------------------

# Reception logs an unknown arrival exactly as the Emergency screen does it:
# register the patient first, then raise the case against them. The phone is
# the same field the form now sanitises — a number that is not exactly ten
# digits is refused here, and that refusal used to surface on the Emergency
# screen as "could not create the emergency case".
r = c.post(
    "/api/patients",
    json={
        "name": "Unknown male, approx. 30s",
        "gender": "male",
        "phone": "6302827291545554",
        "assigned_doctor_id": ids["other_doctor_profile"],
    },
    headers=H["reception"],
)
check("an over-long phone is refused at registration", r.status_code == 422, body(r))

r = c.post(
    "/api/patients",
    json={
        "name": "Unknown male, approx. 30s",
        "gender": "male",
        "phone": "63028272 91",
        "assigned_doctor_id": ids["other_doctor_profile"],
    },
    headers=H["reception"],
)
check("a spaced phone is refused at registration", r.status_code == 422, body(r))

r = c.post(
    "/api/patients",
    json={
        "name": "Unknown male, approx. 30s",
        "gender": "male",
        "phone": "6302827291",
        "assigned_doctor_id": ids["other_doctor_profile"],
    },
    headers=H["reception"],
)
check("an unknown arrival is registered with a ten-digit phone", r.status_code == 201, body(r))
emergency_patient = data_of(r) or {}
emergency_patient_id = emergency_patient.get("id")
check("the number is stored as typed", emergency_patient.get("phone") == "6302827291", emergency_patient.get("phone"))

r = c.post(
    "/api/emergency",
    json={"patient_id": emergency_patient_id, "reason": "Road accident", "severity": "serious"},
    headers=H["doctor"],
)
check("a doctor cannot log an emergency case", r.status_code == 403, r.status_code)

r = c.post(
    "/api/emergency",
    json={"patient_id": emergency_patient_id, "severity": "serious"},
    headers=H["reception"],
)
check("a case with no reason is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/emergency",
    json={"patient_id": emergency_patient_id, "reason": "Road accident", "severity": "urgent"},
    headers=H["reception"],
)
check("an unknown severity is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/emergency",
    json={"patient_id": 999999, "reason": "Road accident"},
    headers=H["reception"],
)
check("an unknown patient is refused", r.status_code == 404, r.status_code)

r = c.post(
    "/api/emergency",
    json={
        "patient_id": emergency_patient_id,
        "reason": "Road accident, unconscious on arrival",
        "severity": "serious",
        # A string, which is what the department <select> yields.
        "department_id": str(ids["ortho"]),
    },
    headers=H["reception"],
)
check("reception logs the emergency case", r.status_code == 201, body(r))
emergency_case = data_of(r) or {}
emergency_case_id = emergency_case.get("id")
check("it opens waiting and unclaimed", emergency_case.get("status") == "waiting" and emergency_case.get("doctor_id") is None, emergency_case)
check("an emergency code is issued", bool(emergency_case.get("code")), emergency_case.get("code"))
check("the department from the form is recorded", emergency_case.get("department_id") == ids["ortho"], emergency_case.get("department_id"))

r = c.get("/api/emergency", headers=H["reception"])
check(
    "it appears on the open board",
    any(e.get("id") == emergency_case_id for e in (data_of(r) or [])),
    data_of(r),
)

# The notification is where a doctor actually hears about this, and it now
# carries the case itself — that payload is what lets the bell and the Alerts
# page draw a Claim button instead of sending the doctor off to find the
# board. Present only while nobody holds the case, and only for a doctor,
# since claiming is doctor-only.


def emergency_notifications(who):
    resp = c.get("/api/notifications", headers=H[who])
    return [
        n
        for n in ((data_of(resp) or {}).get("items") or [])
        if (n.get("emergency_case") or {}).get("id") == emergency_case_id
    ]


claimable = emergency_notifications("other_doctor")
check("a doctor's notification carries the case to claim", bool(claimable), claimable)
check(
    "by both routes to it — the emergency ping, and the patient-assignment "
    "one healing to the case that patient turned out to have",
    {n.get("category") for n in claimable} == {"appointment", "patient_assignment"},
    [n.get("category") for n in claimable],
)
check(
    "with the patient and severity the button needs",
    all(
        n["emergency_case"].get("severity") == "serious"
        and n["emergency_case"].get("patient") == "Unknown male, approx. 30s"
        for n in claimable
    ),
    claimable,
)
check(
    "and a link naming the case, still landing on the board",
    all(n.get("link") == f"/dashboard/emergency?case={emergency_case_id}" for n in claimable),
    [n.get("link") for n in claimable],
)
check("but never for a non-doctor", not emergency_notifications("admin"), "admin")

r = c.post(f"/api/emergency/{emergency_case_id}/claim", headers=H["reception"])
check("reception cannot claim a case", r.status_code == 403, r.status_code)

r = c.post(f"/api/emergency/{emergency_case_id}/claim", headers=H["doctor"])
check("any on-duty doctor can claim it", r.status_code == 200, body(r))
check("claiming puts it in progress", (data_of(r) or {}).get("status") == "in_progress", data_of(r))
check("and records who holds it", (data_of(r) or {}).get("doctor_id") == ids["doctor_profile"], data_of(r))

r = c.post(f"/api/emergency/{emergency_case_id}/claim", headers=H["doctor"])
check("re-claiming your own case is not an error", r.status_code == 200, body(r))

r = c.post(f"/api/emergency/{emergency_case_id}/claim", headers=H["other_doctor"])
check("a second doctor cannot take a claimed case", r.status_code == 409, r.status_code)

# The other doctor's notification is still sitting in their bell, but the
# case behind it is gone — the Claim button has to go with it, or two doctors
# are looking at the same offer.
check(
    "a claimed case stops offering Claim to everyone else",
    not emergency_notifications("other_doctor"),
    "other_doctor",
)

r = c.patch(
    f"/api/emergency/{emergency_case_id}",
    json={"assessment_notes": "GCS 13, stable airway", "decision": "icu"},
    headers=H["other_doctor"],
)
check("a doctor who does not hold it cannot write on it", r.status_code == 403, r.status_code)

r = c.patch(
    f"/api/emergency/{emergency_case_id}",
    json={"assessment_notes": "GCS 13, stable airway", "decision": "icu"},
    headers=H["doctor"],
)
check("the claiming doctor records the assessment", r.status_code == 200, body(r))
check("the decision is kept", (data_of(r) or {}).get("decision") == "icu", data_of(r))

r = c.patch(
    f"/api/emergency/{emergency_case_id}",
    json={"treatment_notes": "2 units O-neg, 1g paracetamol IV at 14:10"},
    headers=H["doctor"],
)
check("and what was given before the ward", r.status_code == 200, body(r))

# -- the emergency hand-off to a nurse ---------------------------------------
#
# The ICU/observation door into the nursing module, and the one path where the
# prescription has no consultation to live on: the claiming doctor types the
# medicines straight onto the assignment. Everything the nurse is told about
# this patient therefore has to come through the assignment payload — there is
# no /api/emergency route a nurse is allowed to call.
r = c.post(
    "/api/nursing/assignments",
    json={
        "patient_id": emergency_patient_id,
        "nurse_id": ids["nurse_profile"],
        "care_type": "icu",
        "treatment_plan": "Hourly neuro obs, strict I/O chart",
        "medications": [
            {
                "medicine_name": "Normal Saline 0.9%",
                "route": "iv",
                "dose": "500ml",
                "frequency": "6 hourly",
                "duration": "2 days",
                "times_per_day": 4,
                "instructions": "Slow — watch for fluid overload",
            },
            {
                "medicine_name": "Paracetamol 650mg",
                "route": "oral",
                "dose": "1 tablet",
                "frequency": "SOS for fever above 38.5",
            },
        ],
    },
    headers=H["doctor"],
)
check("an emergency patient can be handed to a nurse", r.status_code == 201, body(r))
emergency_assignment = data_of(r) or {}
emergency_assignment_id = emergency_assignment.get("id")
check(
    "the ICU care type is accepted",
    emergency_assignment.get("care_type") == "icu",
    emergency_assignment.get("care_type"),
)
check(
    "the assignment records which emergency case it came from",
    emergency_assignment.get("emergency_case_id") == emergency_case_id,
    emergency_assignment.get("emergency_case_id"),
)

r = c.get(f"/api/nursing/assignments/{emergency_assignment_id}", headers=H["nurse"])
check("the nurse can open the emergency patient's record", r.status_code == 200, body(r))
emergency_record = data_of(r) or {}
emergency_block = emergency_record.get("emergency") or {}
check(
    "the record tells the nurse this was an emergency arrival",
    emergency_block.get("code") == emergency_case.get("code")
    and emergency_block.get("severity") == "serious",
    emergency_block,
)
check(
    "with what the patient came in with",
    emergency_block.get("reason") == "Road accident, unconscious on arrival",
    emergency_block.get("reason"),
)
# The specific harm: a nurse who cannot see what casualty already gave has no
# way to avoid giving it twice.
check(
    "and what was already given before the ward",
    emergency_block.get("treatment_notes") == "2 units O-neg, 1g paracetamol IV at 14:10",
    emergency_block.get("treatment_notes"),
)
check(
    "and the doctor's assessment and decision",
    emergency_block.get("assessment_notes") == "GCS 13, stable airway"
    and emergency_block.get("decision") == "icu",
    emergency_block,
)

emergency_orders = emergency_record.get("medication_orders") or []
check(
    "the emergency prescription arrives as the medication schedule",
    len(emergency_orders) == 2,
    emergency_orders,
)
saline = next(
    (o for o in emergency_orders if o.get("medicine_name") == "Normal Saline 0.9%"), {}
)
# Every field the doctor filled in has to survive the hand-off: a schedule
# missing the frequency or the instruction is not a prescription a nurse can
# work from.
check(
    "with the dose, frequency, duration and route intact",
    saline.get("dose") == "500ml"
    and saline.get("frequency") == "6 hourly"
    and saline.get("duration") == "2 days"
    and saline.get("route_label") == "IV / Saline",
    saline,
)
check(
    "and the doses-per-day the schedule counts against",
    saline.get("times_per_day") == 4,
    saline.get("times_per_day"),
)
check(
    "and the instruction for giving it",
    saline.get("instructions") == "Slow — watch for fluid overload",
    saline.get("instructions"),
)
prn = next(
    (o for o in emergency_orders if o.get("medicine_name") == "Paracetamol 650mg"), {}
)
check(
    "an as-needed medicine carries no daily target",
    prn.get("times_per_day") is None,
    prn.get("times_per_day"),
)

# The ward list, where a nurse picks this patient out from a full shift.
r = c.get("/api/nursing/assignments", headers=H["nurse"])
listed = next(
    (a for a in (data_of(r) or []) if a.get("id") == emergency_assignment_id), {}
)
check(
    "the ward list marks the emergency patient",
    (listed.get("emergency") or {}).get("severity") == "serious",
    listed.get("emergency"),
)
check(
    "but leaves the clinical notes to the record itself",
    "treatment_notes" not in (listed.get("emergency") or {}),
    listed.get("emergency"),
)

# A routine post-op patient must not pick any of this up.
r = c.get("/api/nursing/assignments", headers=H["doctor"])
check(
    "a non-emergency assignment carries no emergency block",
    all(
        a.get("emergency") is None
        for a in (data_of(r) or [])
        if a.get("id") != emergency_assignment_id
    ),
    data_of(r),
)

r = c.post(f"/api/emergency/{emergency_case_id}/resolve", json={"decision": "icu"}, headers=H["doctor"])
check("the case resolves", (data_of(r) or {}).get("status") == "resolved", body(r))

r = c.get("/api/emergency", headers=H["reception"])
check(
    "a resolved case leaves the open board",
    all(e.get("id") != emergency_case_id for e in (data_of(r) or [])),
    data_of(r),
)

r = c.get("/api/emergency?status=resolved", headers=H["reception"])
check(
    "and is found under the resolved tab",
    any(e.get("id") == emergency_case_id for e in (data_of(r) or [])),
    data_of(r),
)

# ---------------------------------------------------------------------------
section("consultation — recording, ending and prescribing")
# ---------------------------------------------------------------------------

r = c.get(f"/api/consultations/{consultation_id}", headers=H["doctor"])
check("the doctor can open the room", r.status_code == 200, body(r))

r = c.get(f"/api/consultations/{consultation_id}", headers=H["other_doctor"])
check("another doctor cannot open the room", r.status_code == 404, r.status_code)

r = c.get(f"/api/consultations/{consultation_id}", headers=H["admin"])
check("an admin can open any room, for oversight", r.status_code == 200, r.status_code)

r = c.get(f"/api/consultations/{consultation_id}", headers=H["nurse"])
check(
    "a nurse with no assignment for this patient cannot open the room",
    r.status_code == 404,
    r.status_code,
)

r = c.put(
    f"/api/consultations/{consultation_id}/prescriptions",
    json={
        "prescriptions": [
            {"medicine_name": "Paracetamol", "dose": "500mg", "frequency": "TDS", "duration": "5 days"}
        ]
    },
    headers=H["doctor"],
)
check("the doctor can write a prescription", r.status_code == 200, body(r))

r = c.put(
    f"/api/consultations/{consultation_id}/prescriptions",
    json={"prescriptions": [{"medicine_name": "Paracetamol"}]},
    headers=H["nurse"],
)
check("a nurse cannot write a prescription", r.status_code == 403, r.status_code)

r = c.post(f"/api/consultations/{consultation_id}/prescriptions/verify", headers=H["doctor"])
check("a prescription cannot be signed before the visit ends", r.status_code == 409, msg(r))

r = c.post(f"/api/consultations/{consultation_id}/end", json={}, headers=H["doctor"])
check("a session with no transcript cannot be ended", r.status_code == 422, msg(r))

# The room records through the websocket, which a test client cannot drive.
# Writing the turn directly is the same row that path produces, and it is what
# the end-of-session guard above is actually asking for.
with app.app_context():
    from portal.models.conversation_message import ConversationMessage

    db.session.add(
        ConversationMessage(
            consultation_id=consultation_id,
            speaker="doctor",
            message="Where is the pain?",
        )
    )
    db.session.add(
        ConversationMessage(
            consultation_id=consultation_id,
            speaker="patient",
            message="Across my chest, since this morning.",
        )
    )
    db.session.commit()

r = c.post(f"/api/consultations/{consultation_id}/end", json={}, headers=H["nurse"])
check("a nurse cannot end the session", r.status_code == 403, r.status_code)

r = c.post(f"/api/consultations/{consultation_id}/end", json={}, headers=H["doctor"])
# Everything from here to the end of the case section rides on the session
# actually closing, which needs the AI to write its summary.
session_ended = r.status_code == 200
ai_down = r.status_code in AI_UNAVAILABLE
if ai_down:
    skip("the doctor can end the session", f"AI service unavailable ({r.status_code}): {msg(r)}")
else:
    check("the doctor can end the session", session_ended, body(r))

if not session_ended:
    for label in (
        "ending twice is a no-op",
        "the doctor can sign the prescription off",
        "the signed prescription reads back",
        "the doctor can withdraw the sign-off",
        "the patient moves to 'consulted' once seen",
        "ending the session takes the OP out of the live queue",
        "the OP is looked up as completed",
    ):
        skip(label, "the session could not be ended")
else:
    r = c.post(f"/api/consultations/{consultation_id}/end", json={}, headers=H["doctor"])
    check("ending twice is a no-op", r.status_code == 200 and msg(r) == "Already completed", msg(r))

    r = c.post(f"/api/consultations/{consultation_id}/prescriptions/verify", headers=H["doctor"])
    check("the doctor can sign the prescription off", r.status_code == 200, body(r))

    r = c.get(f"/api/prescriptions/{consultation_id}", headers=H["doctor"])
    check("the signed prescription reads back", r.status_code == 200, body(r))

    r = c.delete(f"/api/consultations/{consultation_id}/prescriptions/verify", headers=H["doctor"])
    check("the doctor can withdraw the sign-off", r.status_code == 200, body(r))

    r = c.get("/api/patients?scope=consulted", headers=H["doctor"])
    check(
        "the patient moves to 'consulted' once seen",
        any(p.get("id") == patient_id for p in (data_of(r) or [])),
        data_of(r),
    )

    r = c.get("/api/appointments", headers=H["reception"])
    queue = data_of(r) or []
    queue = queue if isinstance(queue, list) else queue.get("items", [])
    check(
        "ending the session takes the OP out of the live queue",
        all(a.get("id") != appointment_id for a in queue),
        queue,
    )

    r = c.get("/api/appointments?status=completed", headers=H["reception"])
    done = data_of(r) or []
    done = done if isinstance(done, list) else done.get("items", [])
    check(
        "the OP is looked up as completed",
        any(a.get("id") == appointment_id for a in done),
        done,
    )

# ---------------------------------------------------------------------------
section("cases — sessions gather under one record")
# ---------------------------------------------------------------------------

r = c.get("/api/cases", headers=H["doctor"])
cases = data_of(r) or []
cases = cases if isinstance(cases, list) else cases.get("items", [])
check("the consultation created a case", len(cases) == 1, cases)
case_id = cases[0].get("id") if cases else None

r = c.get(f"/api/cases/{case_id}", headers=H["doctor"])
check("the case reads back with its session", r.status_code == 200, body(r))
case = data_of(r) or {}
check("the case holds one session", len(case.get("sessions") or []) == 1, case.get("sessions"))

r = c.get(f"/api/cases/{case_id}", headers=H["other_doctor"])
check("another doctor cannot read the case", r.status_code in (403, 404), r.status_code)

# A case cannot close over a session still in progress, so this needs the end
# above to have gone through.
if not session_ended:
    skip("the doctor can close the case", "the session could not be ended")
    skip("the doctor can reopen the case", "the session could not be ended")
else:
    # Closing a case writes a consolidated report, which is a second, separate
    # call to the AI — so it can be unavailable even when ending the session
    # was not.
    r = c.post(f"/api/cases/{case_id}/close", json={}, headers=H["doctor"])
    if r.status_code in AI_UNAVAILABLE:
        skip("the doctor can close the case", f"AI service unavailable ({r.status_code})")
        skip("the doctor can reopen the case", "the case could not be closed")
    else:
        check("the doctor can close the case", r.status_code == 200, body(r))

        r = c.post(f"/api/cases/{case_id}/reopen", json={}, headers=H["doctor"])
        check("the doctor can reopen the case", r.status_code == 200, body(r))

# ---------------------------------------------------------------------------
section("the surgical pathway")
# ---------------------------------------------------------------------------

r = c.post(f"/api/patients/{patient_id}/surgery/complete", json={}, headers=H["doctor"])
check("completing a surgery never marked is refused", r.status_code == 409, msg(r))

r = c.post(f"/api/patients/{patient_id}/discharge", json={}, headers=H["doctor"])
check("discharging a patient not under care is refused", r.status_code == 409, msg(r))

r = c.post(
    f"/api/patients/{patient_id}/surgery",
    json={"surgery_notes": "Angioplasty", "observation_days": 3},
    headers=H["reception"],
)
check("reception cannot mark a patient for surgery", r.status_code == 403, r.status_code)

r = c.post(
    f"/api/patients/{patient_id}/surgery",
    json={"surgery_notes": "Angioplasty", "observation_days": 3},
    headers=H["doctor"],
)
check("the doctor marks the case for surgery", r.status_code == 200, body(r))
check("the stage is 'required'", (data_of(r) or {}).get("surgery_stage") == "required", data_of(r))

r = c.post(
    f"/api/patients/{patient_id}/surgery",
    json={"observation_days": 999},
    headers=H["doctor"],
)
check("an absurd observation window is refused", r.status_code == 422, msg(r))

# ---------------------------------------------------------------------------
section("nursing — the hand-off and the record that hangs off it")
# ---------------------------------------------------------------------------

r = c.post(
    "/api/nursing/assignments",
    json={"patient_id": patient_id, "nurse_id": ids["nurse_profile"], "care_type": "observation"},
    headers=H["nurse"],
)
check("a nurse cannot assign themselves", r.status_code == 403, r.status_code)

r = c.post(
    "/api/nursing/assignments",
    json={
        "patient_id": patient_id,
        "nurse_id": ids["nurse_profile"],
        "care_type": "observation",
        "treatment_plan": "Monitor BP every 4h",
        "medications": [
            {"medicine_name": "Paracetamol", "dose": "500mg", "frequency": "TDS", "route": "oral"}
        ],
    },
    headers=H["doctor"],
)
check("the doctor hands the patient to a nurse", r.status_code == 201, body(r))
assignment = data_of(r) or {}
assignment_id = assignment.get("id")

r = c.get(f"/api/consultations/{consultation_id}", headers=H["nurse"])
check(
    "once assigned, the nurse can read the patient's consultation",
    r.status_code == 200,
    r.status_code,
)

r = c.get(f"/api/nursing/assignments/{assignment_id}", headers=H["nurse"])
check("the assigned nurse sees the record", r.status_code == 200, body(r))
record = data_of(r) or {}
orders = record.get("medications") or record.get("medication_orders") or []
check("the medication order came across", len(orders) == 1, orders)
order_id = orders[0].get("id") if orders else None

r = c.patch(
    f"/api/nursing/assignments/{assignment_id}",
    json={"treatment_plan": "Nurse rewrote the plan"},
    headers=H["nurse"],
)
check("a nurse cannot rewrite the treatment plan", r.status_code == 403, r.status_code)

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/medications",
    json={"medicine_name": "Amoxicillin", "dose": "250mg", "frequency": "BD", "route": "oral"},
    headers=H["nurse"],
)
check("a nurse cannot add a medication order", r.status_code == 403, r.status_code)

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/medications",
    json={"medicine_name": "Amoxicillin", "dose": "250mg", "frequency": "BD", "route": "oral"},
    headers=H["doctor"],
)
check("the doctor can add a medication order", r.status_code in (200, 201), body(r))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/administrations",
    json={"order_id": order_id, "status": "completed", "medicine_name": "Paracetamol"},
    headers=H["doctor"],
)
check("a doctor cannot log a dose", r.status_code == 403, r.status_code)

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/administrations",
    json={"order_id": order_id, "status": "completed", "medicine_name": "Paracetamol"},
    headers=H["nurse"],
)
check("the nurse can log a completed dose", r.status_code in (200, 201), body(r))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/administrations",
    json={"order_id": order_id, "status": "missed", "medicine_name": "Paracetamol"},
    headers=H["nurse"],
)
check("the nurse can log a missed dose", r.status_code in (200, 201), body(r))

r = c.get("/api/nursing/alerts?status=open", headers=H["doctor"])
alerts = data_of(r) or []
alerts = alerts if isinstance(alerts, list) else alerts.get("items", [])
check("a missed dose raises an alert automatically", len(alerts) >= 1, alerts)

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/observations",
    json={},
    headers=H["nurse"],
)
check("an empty observation is refused", r.status_code == 422, msg(r))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/observations",
    json={"temperature_c": 99.0},
    headers=H["nurse"],
)
check("a slipped decimal point is caught", r.status_code == 422, msg(r))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/observations",
    json={"temperature_c": 36.8, "pulse_bpm": 76, "systolic_bp": 118, "diastolic_bp": 78},
    headers=H["nurse"],
)
check("the nurse can record normal vitals", r.status_code in (200, 201), body(r))
check("normal vitals are not flagged", (data_of(r) or {}).get("is_abnormal") in (False, None), data_of(r))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/observations",
    json={"temperature_c": 38.9, "pulse_bpm": 130, "systolic_bp": 190, "diastolic_bp": 120},
    headers=H["nurse"],
)
check("the nurse can record abnormal vitals", r.status_code in (200, 201), body(r))

r = c.get("/api/nursing/alerts?status=open", headers=H["doctor"])
alerts2 = data_of(r) or []
alerts2 = alerts2 if isinstance(alerts2, list) else alerts2.get("items", [])
check("vitals outside the ward range escalate", len(alerts2) > len(alerts), (len(alerts), len(alerts2)))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/observations",
    json={"temperature": 37.0},
    headers=H["doctor"],
)
check("a doctor cannot record vitals", r.status_code == 403, r.status_code)

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/notes",
    json={"content": "Patient comfortable overnight.", "note_type": "note"},
    headers=H["nurse"],
)
check("the nurse can write a note", r.status_code in (200, 201), body(r))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/notes",
    json={"content": "  ", "note_type": "note"},
    headers=H["nurse"],
)
check("an empty note is refused", r.status_code == 422, msg(r))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/notes",
    json={"content": "x", "note_type": "telepathy"},
    headers=H["nurse"],
)
check("an unknown note type is refused", r.status_code == 422, msg(r))

r = c.post(
    f"/api/nursing/assignments/{assignment_id}/alerts",
    json={"message": "Wound looks inflamed", "severity": "warning", "category": "other"},
    headers=H["nurse"],
)
check("the nurse can raise an alert by hand", r.status_code in (200, 201), body(r))
raised = data_of(r) or {}

r = c.post(f"/api/nursing/alerts/{raised.get('id')}/acknowledge", json={}, headers=H["nurse"])
check("a nurse cannot acknowledge an alert", r.status_code == 403, r.status_code)

r = c.post(f"/api/nursing/alerts/{raised.get('id')}/acknowledge", json={}, headers=H["doctor"])
check("the doctor can acknowledge an alert", r.status_code == 200, body(r))

r = c.get(f"/api/nursing/assignments/{assignment_id}/timeline", headers=H["doctor"])
timeline = data_of(r) or []
timeline = timeline if isinstance(timeline, list) else timeline.get("items", [])
check("the timeline assembles every record type", len(timeline) >= 5, len(timeline))

r = c.post(f"/api/nursing/assignments/{assignment_id}/messages", json={"body": "How is he?"}, headers=H["doctor"])
check("the doctor can message the nurse", r.status_code in (200, 201), body(r))

r = c.post(f"/api/nursing/assignments/{assignment_id}/messages", json={"body": "Stable."}, headers=H["nurse"])
check("the nurse can reply", r.status_code in (200, 201), body(r))

r = c.get(f"/api/nursing/assignments/{assignment_id}/messages", headers=H["doctor"])
thread = data_of(r) or []
thread = thread if isinstance(thread, list) else thread.get("items", [])
check("both messages are in the thread", len(thread) == 2, thread)

for role in ("pharmacist", "labtech", "accountant", "reception"):
    r = c.get(f"/api/nursing/assignments/{assignment_id}", headers=H[role])
    check(f"{role} cannot read a nursing record", r.status_code == 403, r.status_code)

# ---------------------------------------------------------------------------
section("surgery completion and discharge")
# ---------------------------------------------------------------------------

r = c.post(f"/api/patients/{patient_id}/surgery/complete", json={"observation_days": 2}, headers=H["doctor"])
check("the doctor records the surgery as done", r.status_code == 200, body(r))
check("the stage moves to post_op", (data_of(r) or {}).get("surgery_stage") == "post_op", data_of(r))

r = c.delete(f"/api/patients/{patient_id}/surgery", headers=H["doctor"])
check("surgery cannot be cleared while a nurse is watching", r.status_code == 409, msg(r))

r = c.post(f"/api/patients/{patient_id}/discharge", json={"summary": "Recovered well"}, headers=H["reception"])
check("reception cannot discharge", r.status_code == 403, r.status_code)

r = c.post(f"/api/patients/{patient_id}/discharge", json={"summary": "Recovered well"}, headers=H["doctor"])
check("the doctor discharges the patient", r.status_code == 200, body(r))
check("the pathway is cleared on discharge", (data_of(r) or {}).get("surgery_stage") is None, data_of(r))

r = c.get(f"/api/nursing/assignments/{assignment_id}", headers=H["doctor"])
check("discharge closes the nursing assignment", (data_of(r) or {}).get("status") == "completed", data_of(r))

# ---------------------------------------------------------------------------
section("laboratory")
# ---------------------------------------------------------------------------

r = c.post(
    "/api/lab/requests",
    json={
        "patient_id": patient_id,
        "test_name": "Full Blood Count",
        "priority": "routine",
        "department_id": ids["cardiology"],
    },
    headers=H["doctor"],
)
check("the doctor can order a lab test", r.status_code in (200, 201), body(r))
lab = data_of(r) or {}
lab_id = lab.get("id")

r = c.post(
    "/api/lab/requests",
    json={"patient_id": patient_id, "test_name": "FBC"},
    headers=H["labtech"],
)
check("a technician cannot order a test", r.status_code == 403, r.status_code)

r = c.post(
    "/api/lab/requests",
    json={"patient_id": patient_id, "test_name": "FBC", "priority": "yesterday"},
    headers=H["doctor"],
)
check("an unknown priority is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/lab/requests",
    json={"patient_id": patient_id},
    headers=H["doctor"],
)
check("a test with no name is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/lab/requests",
    json={"patient_id": 999999, "test_name": "FBC"},
    headers=H["doctor"],
)
check("a test for an unknown patient is refused", r.status_code == 404, r.status_code)

r = c.get(f"/api/lab/requests/{lab_id}", headers=H["labtech"])
check("the technician sees the unclaimed request", r.status_code == 200, body(r))

r = c.patch(f"/api/lab/requests/{lab_id}/status", json={"status": "sample_collected"}, headers=H["labtech"])
check("the technician can collect the sample", r.status_code == 200, body(r))

r = c.patch(f"/api/lab/requests/{lab_id}/status", json={"status": "verified"}, headers=H["labtech"])
check("a technician cannot verify a result", r.status_code == 403, f"{r.status_code} {msg(r)}")

r = c.patch(f"/api/lab/requests/{lab_id}/status", json={"status": "processing"}, headers=H["labtech"])
check("the technician can move it to processing", r.status_code == 200, body(r))

r = c.patch(f"/api/lab/requests/{lab_id}/status", json={"status": "completed"}, headers=H["labtech"])
check("the technician can complete it", r.status_code == 200, body(r))

r = c.patch(f"/api/lab/requests/{lab_id}/status", json={"status": "verified"}, headers=H["doctor"])
check("the ordering doctor verifies the result", r.status_code == 200, body(r))

r = c.post(f"/api/lab/requests/{lab_id}/messages", json={"body": "Please rush this."}, headers=H["doctor"])
check("the doctor can post to the discussion", r.status_code in (200, 201), body(r))

r = c.post(f"/api/lab/requests/{lab_id}/messages", json={"body": "Nurse here."}, headers=H["nurse"])
check("an unrelated role cannot post to the discussion", r.status_code == 403, r.status_code)

# ---------------------------------------------------------------------------
section("pharmacy")
# ---------------------------------------------------------------------------

r = c.post(
    "/api/pharmacy/brands",
    json={
        "brand_name": "Calpol 500",
        "generic_name": "Paracetamol",
        "form": "tablet",
        "manufacturer": "GSK",
        "unit_price": "12.50",
        "reorder_level": 20,
        "for_all_departments": True,
    },
    headers=H["pharmacist"],
)
check("the pharmacist can add a brand", r.status_code in (200, 201), body(r))
brand = data_of(r) or {}
brand_id = brand.get("id")

r = c.post("/api/pharmacy/brands", json={"brand_name": "X", "form": "moonbeam"}, headers=H["pharmacist"])
check("an unknown dosage form is refused", r.status_code == 422, msg(r))

r = c.post(
    "/api/pharmacy/stock",
    json={
        "brand_id": brand_id,
        "quantity": 100,
        "expiry_date": (today + timedelta(days=365)).isoformat(),
        "batch_no": "B-001",
    },
    headers=H["pharmacist"],
)
check("the pharmacist can take stock in", r.status_code in (200, 201), body(r))

r = c.post(
    "/api/pharmacy/stock",
    json={"brand_id": brand_id, "quantity": -5, "expiry_date": (today + timedelta(days=90)).isoformat()},
    headers=H["pharmacist"],
)
check("a negative stock quantity is refused", r.status_code == 422, msg(r))

r = c.get("/api/pharmacy/inventory", headers=H["pharmacist"])
check("the inventory lists the new stock", r.status_code == 200, body(r))

r = c.get("/api/pharmacy/summary", headers=H["pharmacist"])
check("the pharmacy summary answers", r.status_code == 200, body(r))

r = c.get("/api/pharmacy/summary", headers=H["admin"])
check("an admin must name a branch", r.status_code == 422, msg(r))

r = c.get(f"/api/pharmacy/summary?branch_id={ids['branch']}", headers=H["admin"])
check("an admin with a branch gets the summary", r.status_code == 200, body(r))

r = c.get(f"/api/pharmacy/search?q=Calpol&branch_id={ids['branch']}", headers=H["admin"])
check("cross-branch search answers", r.status_code == 200, body(r))

r = c.delete(f"/api/pharmacy/brands/{brand_id}", headers=H["doctor"])
check("a doctor cannot delete a brand", r.status_code == 403, r.status_code)

# ---------------------------------------------------------------------------
section("staff administration")
# ---------------------------------------------------------------------------

r = c.post(
    "/api/staff",
    json={
        "name": "Priya Nair",
        "email": "priya.nair@yasodhahospitals.com",
        "role": "nurse",
        "department_id": ids["cardiology"],
    },
    headers=H["admin"],
)
check("the admin can create a staff account", r.status_code in (200, 201), body(r))
created = data_of(r) or {}
new_user = (created.get("user") or created)
new_user_id = new_user.get("id")

r = c.post(
    "/api/staff",
    json={"name": "Nope", "email": "nope@yasodhahospitals.com", "role": "nurse"},
    headers=H["doctor"],
)
check("a doctor cannot create staff", r.status_code == 403, r.status_code)

r = c.post(
    "/api/staff",
    json={"name": "Dup", "email": "priya.nair@yasodhahospitals.com", "role": "nurse"},
    headers=H["admin"],
)
check("a duplicate email is refused", r.status_code in (409, 422), f"{r.status_code} {msg(r)}")

r = c.post(
    "/api/staff",
    json={"name": "Bad Domain", "email": "someone@hotmail.com", "role": "nurse"},
    headers=H["admin"],
)
check("an off-domain email is refused", r.status_code == 422, msg(r))

r = c.patch(f"/api/staff/{new_user_id}", json={"name": "Priya R Nair"}, headers=H["admin"])
check("the admin can edit a staff account", r.status_code == 200, body(r))

r = c.post(f"/api/staff/{new_user_id}/status", json={"is_active": False}, headers=H["admin"])
check("the admin can disable an account", r.status_code == 200, body(r))

r = c.post("/api/auth/login", json={"identifier": "priya.nair@yasodhahospitals.com", "password": "whatever"})
check("a disabled account cannot sign in", r.status_code in (401, 403), r.status_code)

r = c.delete(f"/api/staff/{new_user_id}", headers=H["admin"])
check("the admin can delete the account", r.status_code == 200, body(r))

# ---------------------------------------------------------------------------
section("authentication")
# ---------------------------------------------------------------------------

r = c.post("/api/auth/login", json={"identifier": "docuser", "password": "Password@123"})
check("a username signs in", r.status_code == 200, body(r))
access = (data_of(r) or {}).get("access_token")
check("a token comes back", bool(access), body(r))

r = c.post("/api/auth/login", json={"identifier": "docuser@gmail.com", "password": "Password@123"})
check("an email signs in too", r.status_code == 200, body(r))

r = c.post("/api/auth/login", json={"identifier": "docuser", "password": "wrong"})
check("a wrong password is a 401", r.status_code == 401, r.status_code)

r = c.post("/api/auth/login", json={"identifier": "ghost", "password": "wrong"})
check("an unknown account gives the same 401", r.status_code == 401, r.status_code)
check("the message does not reveal which failed", msg(r) == "Invalid username or password", msg(r))

r = c.post("/api/auth/login", json={"identifier": "docuser"})
check("a missing password is a 422", r.status_code == 422, r.status_code)

r = c.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
check("the token identifies the user", (data_of(r) or {}).get("username") == "docuser", body(r))

r = c.get("/api/auth/me")
check("an anonymous caller is refused", r.status_code == 401, r.status_code)

r = c.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
check("a forged token is refused", r.status_code in (401, 422), r.status_code)

r = c.post(
    "/api/auth/password",
    json={"current_password": "wrong", "new_password": "NewPassword@123"},
    headers=H["doctor"],
)
check("a wrong current password is a 422, not a 401", r.status_code == 422, r.status_code)

r = c.post("/api/auth/password/forgot", json={"identifier": "nobody@gmail.com"})
check("forgot-password answers the same for an unknown account", r.status_code == 200, body(r))

# ---------------------------------------------------------------------------
section("dashboard, notifications and audit")
# ---------------------------------------------------------------------------

for role in ALL_ROLES:
    r = c.get("/api/dashboard/summary", headers=H[role])
    check(f"the dashboard answers for {role}", r.status_code == 200, f"{r.status_code} {msg(r)}")

r = c.get("/api/notifications", headers=H["nurse"])
check("the nurse has notifications from the hand-off", r.status_code == 200, body(r))
notes = data_of(r) or []
notes = notes if isinstance(notes, list) else notes.get("items", [])
check("at least one notification was raised", len(notes) >= 1, len(notes))

if notes:
    r = c.post(f"/api/notifications/{notes[0]['id']}/read", headers=H["nurse"])
    check("a notification can be marked read", r.status_code == 200, body(r))

r = c.post("/api/notifications/read-all", headers=H["nurse"])
check("all notifications can be cleared", r.status_code == 200, body(r))

r = c.get("/api/audit", headers=H["admin"])
check("the admin can read the audit log", r.status_code == 200, body(r))
entries = data_of(r) or []
entries = entries if isinstance(entries, list) else entries.get("items", [])
check("the day's actions were recorded", len(entries) >= 5, len(entries))

for role in ("doctor", "nurse", "reception", "pharmacist", "labtech", "accountant"):
    r = c.get("/api/audit", headers=H[role])
    check(f"{role} cannot read the audit log", r.status_code == 403, r.status_code)

r = c.get(f"/api/audit/entity/patient/{patient_id}", headers=H["admin"])
check("the admin can read one record's history", r.status_code == 200, body(r))

r = c.get(f"/api/audit/entity/patient/{patient_id}", headers=H["doctor"])
check("the treating doctor can read their patient's history", r.status_code == 200, body(r))

r = c.get(f"/api/audit/entity/patient/{patient_id}", headers=H["other_doctor"])
check("another doctor cannot read that patient's history", r.status_code == 404, r.status_code)

r = c.get(f"/api/audit/entity/user/{ids['admin']}", headers=H["doctor"])
check("a doctor cannot read a staff account's history", r.status_code == 403, r.status_code)

r = c.get(f"/api/audit/entity/patient/{patient_id}", headers=H["nurse"])
check("a nurse cannot read the audit trail at all", r.status_code == 403, r.status_code)

# ---------------------------------------------------------------------------
section("reassignment moves the waiting OP with the patient")
# ---------------------------------------------------------------------------
#
# The OP belongs to the doctor it was raised against, so re-routing the patient
# has to carry it across — otherwise it sits in the old doctor's queue for a
# patient who is no longer theirs, and when the new doctor is in another
# department (as here: cardiology -> orthopaedics) it belongs to no queue at
# all, because the row keeps a department nobody who can see the patient works
# in.
r = c.post(
    "/api/patients",
    json={"name": "Routed Twice", "assigned_doctor_id": ids["doctor_profile"]},
    headers=H["reception"],
)
rerouted = data_of(r) or {}
rerouted_id = rerouted.get("id")
rerouted_op_id = (rerouted.get("appointment") or {}).get("id")
check("the OP is raised for the first doctor", bool(rerouted_op_id), rerouted)

r = c.patch(
    f"/api/patients/{rerouted_id}/assignment",
    json={"assigned_doctor_id": ids["other_doctor_profile"]},
    headers=H["reception"],
)
check("reception can re-route the patient", r.status_code == 200, msg(r))

r = c.get("/api/appointments", headers=H["other_doctor"])
moved_queue = data_of(r) or []
check(
    "the waiting OP follows them into the new doctor's queue",
    any(a.get("id") == rerouted_op_id for a in moved_queue),
    moved_queue,
)

r = c.get("/api/appointments", headers=H["doctor"])
old_queue = data_of(r) or []
check(
    "and is gone from the previous doctor's queue",
    all(a.get("id") != rerouted_op_id for a in old_queue),
    old_queue,
)

# ---------------------------------------------------------------------------
section("deletion protects medical records")
# ---------------------------------------------------------------------------

r = c.delete(f"/api/patients/{patient_id}", headers=H["reception"])
check("a patient with clinical records cannot be deleted", r.status_code == 409, msg(r))

r = c.post(
    "/api/patients",
    json={"name": "Walk In Error", "assigned_doctor_id": ids["doctor_profile"]},
    headers=H["reception"],
)
spare_id = (data_of(r) or {}).get("id")
r = c.delete(f"/api/patients/{spare_id}", headers=H["reception"])
check("a patient with no records can be deleted", r.status_code == 200, msg(r))

r = c.delete(f"/api/patients/{spare_id}", headers=H["reception"])
check("deleting it again is a 404", r.status_code == 404, r.status_code)

# ---------------------------------------------------------------------------
summary = f"\n{len(PASSES)} passed, {len(FAILS)} failed"
if SKIPS:
    summary += f", {len(SKIPS)} skipped"
print(summary)
if FAILS:
    print("\nFAILED:")
    for label in FAILS:
        print(f"  - {label}")
if SKIPS:
    print("\nSKIPPED (not run — see the reason printed above each):")
    for label in SKIPS:
        print(f"  - {label}")
    print(
        "\nThese cover the end-of-consultation path, which calls Gemini. Re-run "
        "once the daily quota resets, or point GEMINI_MODEL at a model with "
        "quota left, to exercise them."
    )
sys.exit(1 if FAILS else 0)
