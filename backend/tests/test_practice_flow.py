"""End-to-end: the whole practice workflow, PA and doctor, against a real
database.

    python -m tests.test_practice_flow

Runs against `doctor_test` (TestingConfig appends `_test` to the configured
name, so a run can never touch live records), drops and rebuilds the schema,
and walks the one path this application exists to support:

    PA registers a patient
      -> PA books them in
      -> patient enters the queue, numbered
      -> doctor sees them in the same queue
      -> doctor starts the consultation
      -> PA sees the status change
      -> doctor ends it
      -> the visit is in the patient's history
      -> the PA can read it back

Plus the two authorization questions that decide whether the role split is
real: can the doctor book (no), and can the PA prescribe or end a consultation
(no).

No mocks. Every assertion goes through the HTTP layer and the real database,
because the failures this is written to catch — a queue that strands a
finished patient, a role gate that reads a stale claim — only exist there.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from portal import create_app  # noqa: E402
from portal.extensions import db  # noqa: E402


def _soon(days):
    """An ISO timestamp `days` from now, on the hour — a realistic booking.

    Relative rather than a fixed date so the suite does not quietly start
    failing the year the hardcoded one falls inside the upcoming window.
    """
    when = (datetime.utcnow() + timedelta(days=days)).replace(
        minute=30, second=0, microsecond=0
    )
    return when.strftime("%Y-%m-%dT%H:%M")

PASSED = []
FAILED = []


def check(label, condition, detail=None):
    if condition:
        PASSED.append(label)
        print(f"  PASS  {label}")
    else:
        FAILED.append((label, detail))
        print(f"  FAIL  {label}")
        if detail is not None:
            print(f"        {detail}")


def section(title):
    print(f"\n--- {title} ---")


def body(response):
    try:
        return response.get_json()
    except Exception:  # noqa: BLE001
        return {"raw": response.data[:400]}


def data_of(response):
    payload = body(response) or {}
    return payload.get("data")


def message(response):
    return (body(response) or {}).get("message")


def main():
    app = create_app("testing")

    with app.app_context():
        db.drop_all()
        db.create_all()

    # Rebuilt after drop_all, so the roles, accounts and formulary the app
    # bootstraps at startup are seeded into the empty schema.
    app = create_app("testing")
    client = app.test_client()

    # ---------------------------------------------------------------- auth --
    section("authentication")

    def sign_in(identifier, password):
        response = client.post(
            "/api/auth/login", json={"identifier": identifier, "password": password}
        )
        return response, (data_of(response) or {})

    response, pa_session = sign_in("pa@mediassist.local", "PA@12345")
    check("the PA signs in", response.status_code == 200, body(response))
    check(
        "the PA's role is 'pa'",
        (pa_session.get("user") or {}).get("role") == "pa",
        pa_session.get("user"),
    )
    check(
        "the PA's role reads as 'PA', not 'Pa'",
        (pa_session.get("user") or {}).get("role_label") == "PA",
        (pa_session.get("user") or {}).get("role_label"),
    )

    response, doctor_session = sign_in("doctor@mediassist.local", "Doctor@12345")
    check("the doctor signs in", response.status_code == 200, body(response))
    check(
        "the doctor's role is 'doctor'",
        (doctor_session.get("user") or {}).get("role") == "doctor",
        doctor_session.get("user"),
    )
    check(
        "the doctor account has its practice profile",
        (doctor_session.get("user") or {}).get("doctor_id") is not None,
        doctor_session.get("user"),
    )

    response, _ = sign_in("pa@mediassist.local", "wrong-password")
    check("a wrong password is refused", response.status_code == 401, response.status_code)

    response, _ = sign_in("nobody@mediassist.local", "PA@12345")
    check("an unknown account is refused", response.status_code == 401, response.status_code)

    PA = {"Authorization": f"Bearer {pa_session['access_token']}"}
    DOCTOR = {"Authorization": f"Bearer {doctor_session['access_token']}"}
    NOBODY = {}

    response = client.get("/api/patients", headers=NOBODY)
    check("an unauthenticated request is refused", response.status_code == 401, response.status_code)

    # ------------------------------------------------------------- roles --
    section("exactly two roles exist")

    with app.app_context():
        from portal.models.role import Role

        names = sorted(r.name for r in Role.query.all())
    check("the only roles are pa and doctor", names == ["doctor", "pa"], names)

    # -------------------------------------------------------- registration --
    section("the PA registers patients")

    response = client.post(
        "/api/patients",
        json={
            "name": "Rahul Verma",
            "gender": "male",
            "age": 34,
            "phone": "9876543210",
            "email": "rahul.verma@gmail.com",
            "address": "14 MG Road, Kakinada",
            "blood_group": "o+",
            "emergency_contact_name": "Sunita Verma",
            "emergency_contact_phone": "9876500011",
            "allergies": "Penicillin",
            "existing_conditions": "Type 2 diabetes",
            "medical_history": "Appendectomy 2019",
            "notes": "Prefers morning appointments",
        },
        headers=PA,
    )
    check("the PA registers a patient", response.status_code == 201, body(response))
    rahul = data_of(response) or {}
    rahul_id = rahul.get("id")
    check("a patient code is issued", rahul.get("code") == "PAT0001", rahul.get("code"))
    check("the blood group is normalised to O+", rahul.get("blood_group") == "O+", rahul)
    check("the recorded age is kept", rahul.get("age") == 34, rahul.get("age"))
    check(
        "the patient is assigned to the practice's doctor automatically",
        rahul.get("assigned_doctor_id") is not None,
        rahul.get("assigned_doctor"),
    )
    check(
        "registering alone books nothing",
        "appointment" not in rahul,
        list(rahul.keys()),
    )

    response = client.post(
        "/api/patients", json={"name": "Ramesh Iyer", "age": 51, "phone": "9812345678"},
        headers=PA,
    )
    check("a second patient registers", response.status_code == 201, body(response))
    ramesh_id = (data_of(response) or {}).get("id")

    response = client.post(
        "/api/patients", json={"name": "Sriram Nair", "age": 27}, headers=PA
    )
    sriram_id = (data_of(response) or {}).get("id")
    check("a third patient registers", response.status_code == 201, body(response))

    response = client.post("/api/patients", json={"name": ""}, headers=PA)
    check("a nameless patient is refused", response.status_code == 422, body(response))

    response = client.post(
        "/api/patients", json={"name": "Bad Blood", "blood_group": "P+"}, headers=PA
    )
    check("an invented blood group is refused", response.status_code == 422, message(response))

    response = client.post("/api/patients", json={"name": "Doctor's Patient"}, headers=DOCTOR)
    check("the doctor cannot register a patient", response.status_code == 403, response.status_code)

    # -------------------------------------------------------------- search --
    section("partial patient search")

    response = client.get("/api/patients?search=rah", headers=PA)
    found = [p["name"] for p in (data_of(response) or [])]
    check("'rah' finds Rahul", "Rahul Verma" in found, found)

    response = client.get("/api/patients?search=ram", headers=PA)
    found = [p["name"] for p in (data_of(response) or [])]
    check("'ram' matches mid-word, finding both Ramesh and Sriram",
          {"Ramesh Iyer", "Sriram Nair"} <= set(found), found)

    response = client.get("/api/patients?search=PAT0001", headers=PA)
    found = [p["name"] for p in (data_of(response) or [])]
    check("a patient code finds its patient", found == ["Rahul Verma"], found)

    response = client.get("/api/patients?search=98765", headers=PA)
    found = [p["name"] for p in (data_of(response) or [])]
    check("a partial phone number finds its patient", "Rahul Verma" in found, found)

    response = client.get("/api/patients?search=zzzznotreal", headers=PA)
    check("a search matching nobody returns nothing", (data_of(response) or []) == [], data_of(response))

    # ---------------------------------------------------------- the editing --
    section("correcting a record")

    response = client.patch(
        f"/api/patients/{rahul_id}", json={"phone": "9000011111"}, headers=PA
    )
    check("the PA corrects a phone number", response.status_code == 200, body(response))
    check("the correction is stored", (data_of(response) or {}).get("phone") == "9000011111",
          data_of(response))

    response = client.patch(
        f"/api/patients/{rahul_id}", json={"allergies": "Penicillin, Sulfa"}, headers=DOCTOR
    )
    check("the doctor may correct their patient's allergies",
          response.status_code == 200, body(response))

    # ------------------------------------------------------------- booking --
    section("the PA books appointments")

    response = client.post(
        "/api/appointments",
        json={"patient_id": rahul_id, "walk_in": True, "reason": "Fever for three days"},
        headers=PA,
    )
    check("the PA books a walk-in", response.status_code == 201, body(response))
    rahul_appt = data_of(response) or {}
    check("a walk-in is waiting immediately", rahul_appt.get("status") == "waiting", rahul_appt)
    check("its status reads as 'Waiting'", rahul_appt.get("status_label") == "Waiting", rahul_appt)

    response = client.post(
        "/api/appointments",
        json={"patient_id": rahul_id, "walk_in": True},
        headers=PA,
    )
    check("a double-booking within the window is refused",
          response.status_code == 409, message(response))

    response = client.post(
        "/api/appointments",
        json={"patient_id": ramesh_id, "scheduled_at": _soon(30)},
        headers=PA,
    )
    check("the PA books ahead", response.status_code == 201, body(response))
    ramesh_appt = data_of(response) or {}
    ramesh_appt_id = ramesh_appt.get("id")
    check("a future booking is 'scheduled', not queued",
          ramesh_appt.get("status") == "scheduled", ramesh_appt)
    check("its status reads as 'Scheduled'",
          ramesh_appt.get("status_label") == "Scheduled", ramesh_appt)

    response = client.post(
        "/api/appointments", json={"patient_id": sriram_id}, headers=PA
    )
    check("a booking with neither a time nor a walk-in flag is refused",
          response.status_code == 422, message(response))

    response = client.post(
        "/api/appointments", json={"patient_id": sriram_id, "walk_in": True}, headers=DOCTOR
    )
    check("the doctor cannot book", response.status_code == 403, response.status_code)

    # ------------------------------------------------------- reschedule --
    section("rescheduling and cancelling")

    response = client.patch(
        f"/api/appointments/{ramesh_appt_id}",
        json={"scheduled_at": _soon(45)},
        headers=PA,
    )
    check("the PA reschedules a booking", response.status_code == 200, body(response))
    check("the new time is stored",
          (data_of(response) or {}).get("scheduled_at", "").startswith(_soon(45)[:16]),
          (data_of(response) or {}).get("scheduled_at"))

    response = client.get("/api/appointments/upcoming?days=365", headers=PA)
    upcoming_ids = [a["id"] for a in (data_of(response) or [])]
    check("the booking appears in upcoming", ramesh_appt_id in upcoming_ids, upcoming_ids)

    response = client.post(
        f"/api/appointments/{ramesh_appt_id}/cancel",
        json={"reason": "Patient rang to cancel"},
        headers=PA,
    )
    check("the PA cancels a booking", response.status_code == 200, body(response))
    check("it is recorded as cancelled",
          (data_of(response) or {}).get("status") == "cancelled", data_of(response))

    response = client.get("/api/appointments/upcoming?days=365", headers=PA)
    upcoming_ids = [a["id"] for a in (data_of(response) or [])]
    check("a cancelled booking leaves upcoming", ramesh_appt_id not in upcoming_ids, upcoming_ids)

    # ---------------------------------------------------------- check-in --
    section("check-in puts a booking into the queue")

    response = client.post(
        "/api/appointments",
        json={"patient_id": sriram_id, "scheduled_at": _soon(60)},
        headers=PA,
    )
    sriram_appt_id = (data_of(response) or {}).get("id")

    response = client.get("/api/appointments/queue", headers=PA)
    queued_patients = [a["patient"] for a in (data_of(response) or [])]
    check("a scheduled patient is not in the queue yet",
          "Sriram Nair" not in queued_patients, queued_patients)

    response = client.post(f"/api/appointments/{sriram_appt_id}/check-in", headers=PA)
    check("the PA checks the patient in", response.status_code == 200, body(response))
    check("check-in moves them to waiting",
          (data_of(response) or {}).get("status") == "waiting", data_of(response))

    response = client.post(f"/api/appointments/{sriram_appt_id}/check-in", headers=PA)
    check("checking in twice is harmless", response.status_code == 200, body(response))

    # ------------------------------------------------------------- queue --
    section("the queue is numbered, and both roles see the same one")

    response = client.get("/api/appointments/queue", headers=PA)
    pa_queue = data_of(response) or []
    check("the queue holds both waiting patients", len(pa_queue) == 2, pa_queue)
    check("positions are 1 and 2, in arrival order",
          [a["queue_number"] for a in pa_queue] == [1, 2],
          [(a["patient"], a["queue_number"]) for a in pa_queue])
    check("Rahul arrived first, so he is number 1",
          pa_queue[0]["patient"] == "Rahul Verma", pa_queue[0]["patient"])

    response = client.get("/api/appointments/queue", headers=DOCTOR)
    doctor_queue = data_of(response) or []
    check("the doctor sees the identical queue",
          [(a["id"], a["queue_number"]) for a in doctor_queue]
          == [(a["id"], a["queue_number"]) for a in pa_queue],
          doctor_queue)

    # ------------------------------------------------------ consultation --
    section("the doctor's consultation")

    rahul_appt_id = pa_queue[0]["id"]

    response = client.post(f"/api/appointments/{rahul_appt_id}/start", headers=PA)
    check("the PA cannot start a consultation", response.status_code == 403, response.status_code)

    response = client.post(f"/api/appointments/{rahul_appt_id}/start", headers=DOCTOR)
    check("the doctor starts the consultation", response.status_code == 200, body(response))
    consultation = data_of(response) or {}
    consultation_id = consultation.get("id")
    check("the consultation is in progress",
          consultation.get("status") == "in_progress", consultation.get("status"))

    response = client.get("/api/appointments/queue", headers=PA)
    pa_queue = data_of(response) or []
    now_consulting = [a for a in pa_queue if a["status"] == "in_progress"]
    check("the PA immediately sees the patient as 'In Consultation'",
          len(now_consulting) == 1
          and now_consulting[0]["patient"] == "Rahul Verma"
          and now_consulting[0]["status_label"] == "In Consultation",
          [(a["patient"], a["status_label"]) for a in pa_queue])
    check("the patient being seen is queue position 0",
          now_consulting[0]["queue_number"] == 0, now_consulting[0]["queue_number"])
    check("the patient behind them moves up to 1",
          [a["queue_number"] for a in pa_queue if a["status"] == "waiting"] == [1],
          [(a["patient"], a["queue_number"]) for a in pa_queue])

    response = client.post(f"/api/appointments/{rahul_appt_id}/start", headers=DOCTOR)
    check("starting twice resumes rather than erroring",
          response.status_code == 200, body(response))

    # A consultation cannot be ended with no conversation recorded, and
    # recording one needs audio through Whisper. The transcript is written
    # directly so the rest of the workflow can be exercised without it.
    with app.app_context():
        from portal.models.conversation_message import ConversationMessage

        db.session.add(
            ConversationMessage(
                consultation_id=consultation_id,
                speaker="patient",
                message="I have had a fever and a sore throat for three days.",
            )
        )
        db.session.add(
            ConversationMessage(
                consultation_id=consultation_id,
                speaker="doctor",
                message="Any cough or breathlessness?",
            )
        )
        db.session.commit()

    response = client.get(f"/api/consultations/{consultation_id}", headers=PA)
    check("the PA may read the consultation", response.status_code == 200, response.status_code)
    check("but is not offered the recording controls",
          (data_of(response) or {}).get("can_manage") is False,
          (data_of(response) or {}).get("can_manage"))

    response = client.put(
        f"/api/consultations/{consultation_id}/prescriptions",
        json={"prescriptions": [{"medicine_name": "Dolo 650", "dose": "1 tablet"}]},
        headers=PA,
    )
    check("the PA cannot prescribe", response.status_code == 403, response.status_code)

    response = client.post(f"/api/consultations/{consultation_id}/end", headers=PA)
    check("the PA cannot end a consultation", response.status_code == 403, response.status_code)

    response = client.put(
        f"/api/consultations/{consultation_id}/prescriptions",
        json={
            "prescriptions": [
                {
                    "medicine_name": "Dolo 650",
                    "dose": "1 tablet",
                    "frequency": "Twice daily",
                    "duration": "5 days",
                    "route": "oral",
                }
            ]
        },
        headers=DOCTOR,
    )
    check("the doctor prescribes from the catalogue", response.status_code == 200, body(response))
    check("the prescription is recorded",
          len((data_of(response) or {}).get("prescriptions") or []) == 1,
          (data_of(response) or {}).get("prescriptions"))

    response = client.put(
        f"/api/consultations/{consultation_id}/prescriptions",
        json={"prescriptions": [{"medicine_name": "Notarealmedicine 999"}]},
        headers=DOCTOR,
    )
    check("an unrecognised medicine is refused unless entered deliberately",
          response.status_code == 422, message(response))

    # ---------------------------------------------------------- medicines --
    section("the prescribing catalogue")

    response = client.get("/api/prescriptions/medicines?q=dolo", headers=DOCTOR)
    items = (data_of(response) or {}).get("items") or []
    check("the picker finds a medicine from three letters",
          any("Dolo" in i["name"] for i in items), [i["name"] for i in items])

    response = client.get("/api/prescriptions/medicines", headers=DOCTOR)
    total = (data_of(response) or {}).get("total_available") or 0
    check("the catalogue is not empty on a fresh database", total > 0, total)

    # --------------------------------------------------------------- end --
    section("ending the consultation")

    response = client.post(f"/api/consultations/{consultation_id}/end", headers=DOCTOR)
    check("the doctor ends the consultation", response.status_code == 200, body(response))
    ended = data_of(response) or {}
    check("it is completed", ended.get("status") == "completed", ended.get("status"))

    response = client.get("/api/appointments/queue", headers=PA)
    pa_queue = data_of(response) or []
    check("the finished patient has left the queue",
          all(a["patient"] != "Rahul Verma" for a in pa_queue),
          [a["patient"] for a in pa_queue])
    check("the next patient is now number 1",
          [a["queue_number"] for a in pa_queue] == [1],
          [(a["patient"], a["queue_number"]) for a in pa_queue])

    # ----------------------------------------------------------- history --
    section("the visit becomes history")

    response = client.get(f"/api/appointments/history?patient_id={rahul_id}", headers=PA)
    items = (data_of(response) or {}).get("items") or []
    check("the appointment is in the history", len(items) >= 1, items)
    check("its consultation travels with it",
          bool(items and items[0].get("consultation")), items[0] if items else None)

    response = client.get("/api/consultations", headers=DOCTOR)
    consultations = data_of(response) or []
    check("the doctor sees the completed consultation",
          any(c["id"] == consultation_id for c in consultations), consultations)

    response = client.get("/api/consultations", headers=PA)
    check("the PA can read the consultation history too",
          response.status_code == 200, response.status_code)

    response = client.get(f"/api/prescriptions?patient_id={rahul_id}", headers=PA)
    check("the PA can read prescriptions", response.status_code == 200, response.status_code)

    # -------------------------------------------------------- dashboards --
    section("both dashboards")

    response = client.get("/api/dashboard/summary", headers=PA)
    pa_summary = data_of(response) or {}
    check("the PA dashboard loads", response.status_code == 200, body(response))
    check("it is the front-desk view", pa_summary.get("scope") == "front_desk", pa_summary.get("scope"))
    check("its queue count matches the queue it carries",
          pa_summary.get("todays_appointments") == len(pa_summary.get("queue") or []),
          (pa_summary.get("todays_appointments"), len(pa_summary.get("queue") or [])))
    check("it counts all three patients",
          pa_summary.get("total_patients") == 3, pa_summary.get("total_patients"))
    check("it counts one completed consultation today",
          pa_summary.get("todays_completed") == 1, pa_summary.get("todays_completed"))
    check("it carries no clinical figures",
          "reports_generated" not in pa_summary, sorted(pa_summary.keys()))

    response = client.get("/api/dashboard/summary", headers=DOCTOR)
    doctor_summary = data_of(response) or {}
    check("the doctor dashboard loads", response.status_code == 200, body(response))
    check("it is the clinical view", doctor_summary.get("scope") == "clinical",
          doctor_summary.get("scope"))
    check("it carries clinical figures", "reports_generated" in doctor_summary,
          sorted(doctor_summary.keys()))
    check("both roles agree on the queue",
          doctor_summary.get("todays_appointments") == pa_summary.get("todays_appointments"),
          (doctor_summary.get("todays_appointments"), pa_summary.get("todays_appointments")))

    # ----------------------------------------------------------- reports --
    section("reports")

    # A report is the practice's formal account of the visit, so it cannot be
    # issued over a prescription nobody has signed. Verifying first is the real
    # workflow, not a step around a check.
    response = client.post(
        "/api/reports", json={"consultation_id": consultation_id}, headers=DOCTOR
    )
    check("a report over an unsigned prescription is refused",
          response.status_code == 409, message(response))

    response = client.post(
        f"/api/consultations/{consultation_id}/prescriptions/verify", headers=PA
    )
    check("the PA cannot sign off a prescription", response.status_code == 403, response.status_code)

    response = client.post(
        f"/api/consultations/{consultation_id}/prescriptions/verify", headers=DOCTOR
    )
    check("the doctor signs off the prescription", response.status_code == 200, body(response))
    check("the sign-off is recorded",
          (data_of(response) or {}).get("prescription_verified") is True,
          (data_of(response) or {}).get("prescription_verified"))

    response = client.post(
        "/api/reports", json={"consultation_id": consultation_id}, headers=DOCTOR
    )
    check("the doctor generates a report", response.status_code in (200, 201), body(response))

    response = client.get("/api/reports", headers=PA)
    check("the PA can read the report list", response.status_code == 200, response.status_code)
    reports = data_of(response) or []
    check("the report is listed", len(reports) >= 1, reports)

    response = client.post(
        "/api/reports", json={"consultation_id": consultation_id}, headers=PA
    )
    check("the PA cannot generate a report", response.status_code == 403, response.status_code)

    # ------------------------------------------------- removed hospital API --
    section("the hospital modules are gone")

    for path in (
        "/api/emergency",
        "/api/nursing/summary",
        "/api/pharmacy/medicines",
        "/api/lab/requests",
        "/api/staff",
        "/api/shifts",
        "/api/departments",
    ):
        response = client.get(path, headers=PA)
        check(f"{path} no longer exists", response.status_code == 404, response.status_code)

    # ------------------------------------------------------------ deletion --
    section("deleting a registration")

    response = client.delete(f"/api/patients/{rahul_id}", headers=PA)
    check("a patient with a consultation cannot be deleted",
          response.status_code == 409, message(response))

    response = client.post("/api/patients", json={"name": "Typo Entry"}, headers=PA)
    typo_id = (data_of(response) or {}).get("id")
    response = client.delete(f"/api/patients/{typo_id}", headers=PA)
    check("a patient with no records can be deleted", response.status_code == 200, body(response))

    # ------------------------------------------------------------- logout --
    section("logout")

    response = client.post("/api/auth/logout", headers=PA)
    check("logout succeeds", response.status_code == 200, body(response))

    # ------------------------------------------------------------ verdict --
    print(f"\n{'=' * 60}")
    print(f"{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("\nFailures:")
        for label, detail in FAILED:
            print(f"  - {label}")
            if detail is not None:
                print(f"      {detail}")
    print("=" * 60)
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
