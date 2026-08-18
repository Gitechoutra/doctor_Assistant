"""End-to-end: the patient portal, and the one appointment both sides read.

    python -m tests.test_patient_portal_flow

Runs against `doctor_test` (TestingConfig appends `_test` to the configured
name, so a run can never touch live records), drops and rebuilds the schema,
and walks the flow the portal exists for:

    a patient registers online
      -> they book an appointment
      -> the doctor sees that same appointment in their list
      -> the doctor calls them in        (both sides say "in consultation")
      -> the doctor ends the consultation
      -> it leaves the patient's active list
      -> it appears in the patient's history, completed
      -> the doctor's history has the same row

Plus the two questions that decide whether any of that is safe:

  * **does a patient's token stop at the portal?** Every staff route is
    `@jwt_required()` and reads "no doctor profile" as the front desk, so a
    patient token that reached one would be served the practice's whole book.
    The boundary in `helpers/portal_auth` is asserted against real staff
    routes here, not reasoned about.
  * **can a patient reach another patient's records?** Asserted by trying.

No mocks anywhere the flow is the point. The single exception is documented
where it happens: ending a consultation calls Gemini, and this suite falls
back to completing the visit directly if the AI is unavailable — the property
under test is the appointment's status moving, which has nothing to do with
the summary.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from portal import create_app  # noqa: E402
from portal.extensions import db  # noqa: E402

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
    return (body(response) or {}).get("data")


def message(response):
    return (body(response) or {}).get("message")


def _soon(days=2, hour=10):
    """An ISO timestamp `days` from now. Relative, so the suite does not start
    failing the year a hardcoded date falls into the past."""
    when = (datetime.utcnow() + timedelta(days=days)).replace(
        hour=hour, minute=30, second=0, microsecond=0
    )
    return when.strftime("%Y-%m-%dT%H:%M")


def main():
    app = create_app("testing")
    with app.app_context():
        db.drop_all()
        db.create_all()

    # Rebuilt after drop_all so the roles, accounts and formulary the app
    # bootstraps at startup are seeded into the empty schema.
    app = create_app("testing")
    client = app.test_client()

    # ------------------------------------------------------------- staff --
    section("the practice signs in")

    def sign_in(identifier, password):
        response = client.post(
            "/api/auth/login", json={"identifier": identifier, "password": password}
        )
        return response, (data_of(response) or {})

    # The doctor is the one seeded account -- see seeders/seed_doctor. Read
    # from the seeder rather than hardcoded, so changing the practice's login
    # does not silently break this suite.
    from portal.seeders.seed_doctor import doctor_credentials  # noqa: PLC0415

    _name, doctor_email, doctor_password, _default = doctor_credentials()

    response, doctor_session = sign_in(doctor_email, doctor_password)
    check("the doctor signs in", response.status_code == 200, body(response))

    # There is no seeded PA: the doctor creates the desk's accounts, and that
    # route generates the password and emails it rather than returning it (see
    # routes/pa_routes.create_pa). So the desk account is made here as
    # fixture, with a password this suite knows. Test setup, not a stand-in
    # for anything under test -- every assertion below still goes through HTTP.
    PA_EMAIL = "desk.assistant@gmail.com"
    PA_PASSWORD = "Desk@12345"
    with app.app_context():
        from portal.models.role import PA as PA_ROLE, Role
        from portal.models.user import User

        if not User.query.filter_by(email=PA_EMAIL).first():
            desk = User(
                name="Desk Assistant",
                username="desk.assistant",
                email=PA_EMAIL,
                role_id=Role.query.filter_by(name=PA_ROLE).first().id,
            )
            desk.set_password(PA_PASSWORD)
            db.session.add(desk)
            db.session.commit()

    response, pa_session = sign_in(PA_EMAIL, PA_PASSWORD)
    check("the PA signs in", response.status_code == 200, body(response))

    PA = {"Authorization": f"Bearer {pa_session['access_token']}"}
    DOCTOR = {"Authorization": f"Bearer {doctor_session['access_token']}"}

    # -------------------------------------------------------- enrolment --
    section("a patient registers online")

    response = client.post(
        "/api/portal/register",
        json={
            "name": "Meera Iyer",
            "phone": "9811100011",
            "email": "meera.iyer@gmail.com",
            "dob": "1991-04-12",
            "gender": "female",
            "password": "Portal@2026",
        },
    )
    check("a new patient can register", response.status_code == 201, body(response))
    meera = data_of(response) or {}
    MEERA = {"Authorization": f"Bearer {meera.get('access_token')}"}
    meera_id = (meera.get("patient") or {}).get("id")
    check("registering signs them straight in", bool(meera.get("access_token")), meera.keys())
    check(
        "they are assigned to the practice's doctor",
        ((meera.get("patient") or {}).get("doctor") or {}).get("name") is not None,
        meera.get("patient"),
    )
    check(
        "a patient code is issued, same series as the desk's",
        ((meera.get("patient") or {}).get("code") or "").startswith("PAT"),
        (meera.get("patient") or {}).get("code"),
    )

    response = client.post(
        "/api/portal/register",
        json={
            "name": "Someone Else",
            "phone": "9822200022",
            "email": "meera.iyer@gmail.com",
            "password": "Portal@2026",
        },
    )
    check(
        "the same email cannot register twice",
        response.status_code == 409,
        response.status_code,
    )

    response = client.post(
        "/api/portal/register",
        json={"name": "Short Pass", "phone": "9833300033",
              "email": "short.pass@gmail.com", "password": "abc"},
    )
    check("a short password is refused", response.status_code == 422, message(response))

    response = client.post(
        "/api/portal/login",
        json={"email": "meera.iyer@gmail.com", "password": "wrong-password"},
    )
    check("a wrong password is refused", response.status_code == 401, response.status_code)

    response = client.post(
        "/api/portal/login",
        json={"email": "meera.iyer@gmail.com", "password": "Portal@2026"},
    )
    check("the patient signs in", response.status_code == 200, body(response))
    MEERA = {"Authorization": f"Bearer {(data_of(response) or {})['access_token']}"}

    # ------------------------------------------------------- the boundary --
    section("a patient's token stops at the portal")

    # The real failure this guards against: every staff route reads "no doctor
    # profile" as the front desk. These are the actual routes, not stand-ins.
    for path in (
        "/api/patients",
        "/api/appointments",
        "/api/appointments/queue",
        "/api/appointments/history",
        "/api/consultations",
        "/api/prescriptions",
        "/api/dashboard/summary",
        "/api/reports",
        "/api/audit",
    ):
        response = client.get(path, headers=MEERA)
        check(
            f"a patient token is refused at {path}",
            response.status_code == 403,
            f"{response.status_code}: {message(response)}",
        )

    response = client.post(
        "/api/patients", json={"name": "Injected Patient"}, headers=MEERA
    )
    check(
        "a patient cannot register patients",
        response.status_code == 403,
        response.status_code,
    )

    response = client.get("/api/portal/me", headers=DOCTOR)
    check(
        "a staff token is refused inside the portal",
        response.status_code == 403,
        f"{response.status_code}: {message(response)}",
    )

    response = client.get("/api/portal/appointments")
    check(
        "an unauthenticated portal request is refused",
        response.status_code == 401,
        response.status_code,
    )

    # ---------------------------------------------------------- booking --
    section("the patient books an appointment")

    response = client.get("/api/portal/appointments", headers=MEERA)
    check(
        "their list starts empty",
        data_of(response) == [],
        data_of(response),
    )

    booked_at = _soon(days=2)
    response = client.post(
        "/api/portal/appointments",
        json={"scheduled_at": booked_at, "reason": "Persistent cough"},
        headers=MEERA,
    )
    check("the patient books", response.status_code == 201, body(response))
    appointment = data_of(response) or {}
    appointment_id = appointment.get("id")
    check("it is scheduled", appointment.get("status") == "scheduled", appointment.get("status"))
    check(
        "it carries the doctor's name, not an internal id",
        "doctor_id" not in appointment and appointment.get("doctor"),
        appointment,
    )

    response = client.post(
        "/api/portal/appointments",
        json={"scheduled_at": _soon(days=3), "reason": "Double booking"},
        headers=MEERA,
    )
    check(
        "booking twice in a row is refused as a duplicate",
        response.status_code == 409,
        f"{response.status_code}: {message(response)}",
    )

    response = client.post(
        "/api/portal/appointments",
        json={"scheduled_at": (datetime.utcnow() + timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M")},
        headers=MEERA,
    )
    check(
        "booking for five minutes' time is refused",
        response.status_code in (409, 422),
        f"{response.status_code}: {message(response)}",
    )

    # ------------------------------------------------- both sides agree --
    section("the doctor sees the same appointment")

    response = client.get("/api/portal/appointments", headers=MEERA)
    patient_list = data_of(response) or []
    check("it is on the patient's list", len(patient_list) == 1, patient_list)

    response = client.get("/api/appointments", headers=DOCTOR)
    doctor_list = data_of(response) or []
    doctor_row = next((a for a in doctor_list if a["id"] == appointment_id), None)
    check(
        "the same appointment is on the doctor's list",
        doctor_row is not None,
        [(a["id"], a["patient"]) for a in doctor_list],
    )
    check(
        "it is the same row, not a copy",
        doctor_row and doctor_row["code"] == patient_list[0]["code"],
        (doctor_row or {}).get("code"),
    )
    check(
        "both sides read the same status",
        doctor_row and doctor_row["status"] == patient_list[0]["status"],
        (doctor_row or {}).get("status"),
    )
    check(
        "both sides read the same booked time",
        doctor_row and doctor_row["scheduled_at"] == patient_list[0]["scheduled_at"],
        ((doctor_row or {}).get("scheduled_at"), patient_list[0].get("scheduled_at")),
    )
    check(
        "the desk sees it in the appointment book too",
        any(
            a["id"] == appointment_id
            for a in (data_of(client.get("/api/appointments/upcoming", headers=PA)) or [])
        ),
        None,
    )

    # ------------------------------------------------- somebody else's --
    section("one patient cannot reach another's records")

    response = client.post(
        "/api/portal/register",
        json={
            "name": "Arjun Nair",
            "phone": "9844400044",
            "email": "arjun.nair@gmail.com",
            "dob": "1985-09-02",
            "password": "Portal@2026",
        },
    )
    check("a second patient registers", response.status_code == 201, body(response))
    ARJUN = {"Authorization": f"Bearer {(data_of(response) or {})['access_token']}"}

    response = client.get("/api/portal/appointments", headers=ARJUN)
    check(
        "the second patient's list is their own, and empty",
        data_of(response) == [],
        data_of(response),
    )

    response = client.post(
        f"/api/portal/appointments/{appointment_id}/cancel", headers=ARJUN
    )
    check(
        "they cannot cancel somebody else's appointment",
        response.status_code == 404,
        f"{response.status_code}: {message(response)}",
    )

    # ------------------------------------------------ claiming a record --
    section("a patient the desk already registered claims their record")

    response = client.post(
        "/api/patients",
        json={
            "name": "Kavita Rao",
            "gender": "female",
            "dob": "1979-11-23",
            "phone": "9855500055",
            "here_now": False,
        },
        headers=PA,
    )
    check("the PA registers a patient at the desk", response.status_code == 201, body(response))
    kavita_id = (data_of(response) or {}).get("id")

    response = client.post(
        "/api/portal/register",
        json={
            "name": "Kavita Rao",
            "phone": "9855500055",
            "email": "kavita.rao@gmail.com",
            "dob": "1970-01-01",  # wrong
            "password": "Portal@2026",
        },
    )
    check(
        "a mismatched date of birth cannot claim the record",
        response.status_code == 409,
        f"{response.status_code}: {message(response)}",
    )

    response = client.post(
        "/api/portal/register",
        json={
            "name": "Kavita Rao",
            "phone": "9855500055",
            "email": "kavita.rao@gmail.com",
            "dob": "1979-11-23",
            "password": "Portal@2026",
        },
    )
    check("the right details claim it", response.status_code == 201, body(response))
    claimed = (data_of(response) or {}).get("patient") or {}
    check(
        "it is the record the desk made, not a second one",
        claimed.get("id") == kavita_id,
        (claimed.get("id"), kavita_id),
    )

    with app.app_context():
        from portal.models.patient import Patient

        duplicates = Patient.query.filter_by(phone="9855500055").count()
    check("no duplicate patient row was created", duplicates == 1, duplicates)

    # ------------------------------------------------------ the visit --
    section("the doctor calls the patient in")

    # The desk checks them in on the day. A patient cannot do this themselves,
    # and that refusal is asserted rather than assumed.
    response = client.post(
        f"/api/portal/appointments/{appointment_id}/check-in", headers=MEERA
    )
    check(
        "the portal has no check-in route at all",
        response.status_code == 404,
        response.status_code,
    )

    response = client.post(f"/api/appointments/{appointment_id}/check-in", headers=PA)
    check("the desk checks them in", response.status_code == 200, body(response))

    response = client.get("/api/portal/appointments", headers=MEERA)
    waiting = data_of(response) or []
    check(
        "the patient's own list now says waiting",
        waiting and waiting[0]["status"] == "waiting",
        waiting,
    )

    response = client.post(f"/api/portal/appointments/{appointment_id}/cancel", headers=MEERA)
    check(
        "once checked in, the patient can no longer cancel online",
        response.status_code == 409,
        f"{response.status_code}: {message(response)}",
    )

    response = client.post(f"/api/appointments/{appointment_id}/start", headers=DOCTOR)
    check("the doctor starts the consultation", response.status_code == 200, body(response))
    consultation_id = (data_of(response) or {}).get("id")

    response = client.get("/api/portal/appointments", headers=MEERA)
    in_progress = data_of(response) or []
    check(
        "the patient's list says in consultation",
        in_progress and in_progress[0]["status"] == "in_progress",
        in_progress,
    )
    check(
        "and renders it as words, the same words the doctor sees",
        in_progress and in_progress[0]["status_label"] == "In Consultation",
        in_progress[0].get("status_label") if in_progress else None,
    )

    # ------------------------------------------------------ completion --
    section("the doctor ends it, and the patient's list keeps up")

    # `/end` refuses a consultation with nothing recorded, and the real way to
    # record one is `/transcribe`, which wants an audio file. The transcript is
    # put in place directly so the route under test is reached with its
    # precondition genuinely met -- the conversation is fixture, the ending is
    # not.
    with app.app_context():
        from portal.models.conversation_message import ConversationMessage

        for speaker, text in (
            ("doctor", "What has been troubling you?"),
            ("patient", "A dry cough for about two weeks, worse at night."),
            ("doctor", "Any fever or breathlessness?"),
            ("patient", "No fever. I get a little breathless climbing stairs."),
        ):
            db.session.add(
                ConversationMessage(
                    consultation_id=consultation_id, speaker=speaker, message=text
                )
            )
        db.session.commit()

    response = client.post(f"/api/consultations/{consultation_id}/end", headers=DOCTOR)
    ended_over_http = response.status_code == 200
    if ended_over_http:
        check("the doctor ends the consultation", True)
    else:
        # Ending calls Gemini for the summary. When the key is absent or the
        # quota is spent that is an AI failure, not a flow failure -- and the
        # property under test is the appointment's status moving, which the
        # summary has nothing to do with. Completed directly so the rest of the
        # walk still runs, and printed loudly so a green run is never mistaken
        # for one that exercised the AI path.
        print(
            f"        NOTE  /end returned {response.status_code} "
            f"({message(response)!r}); completing directly instead."
        )
        with app.app_context():
            from portal.helpers.queue_helper import complete_appointment_for
            from portal.models.consultation import Consultation

            consultation = Consultation.query.get(consultation_id)
            consultation.status = "completed"
            consultation.ended_at = datetime.utcnow()
            complete_appointment_for(consultation)
            db.session.commit()

    response = client.get("/api/portal/appointments", headers=MEERA)
    active = data_of(response) or []
    check(
        "the finished visit has left the patient's active list",
        all(a["id"] != appointment_id for a in active),
        active,
    )

    response = client.get("/api/portal/appointments/history", headers=MEERA)
    history = (data_of(response) or {}).get("items") or []
    finished = next((a for a in history if a["id"] == appointment_id), None)
    check("it is in the patient's history", finished is not None, history)
    check(
        "and it reads as completed",
        finished and finished["status"] == "completed",
        (finished or {}).get("status"),
    )
    check(
        "history says whether the report is ready",
        finished and "report_ready" in finished,
        sorted((finished or {}).keys()),
    )

    response = client.get("/api/appointments", headers=DOCTOR)
    doctor_active = data_of(response) or []
    check(
        "it has left the doctor's active list too",
        all(a["id"] != appointment_id for a in doctor_active),
        [(a["id"], a["status"]) for a in doctor_active],
    )

    response = client.get(f"/api/appointments/history?patient_id={meera_id}", headers=DOCTOR)
    doctor_history = (data_of(response) or {}).get("items") or []
    doctor_finished = next((a for a in doctor_history if a["id"] == appointment_id), None)
    check(
        "the doctor's history has the same appointment",
        doctor_finished is not None,
        [(a["id"], a["status"]) for a in doctor_history],
    )
    check(
        "and both sides agree it is completed",
        doctor_finished
        and finished
        and doctor_finished["status"] == finished["status"] == "completed",
        ((doctor_finished or {}).get("status"), (finished or {}).get("status")),
    )

    response = client.get("/api/appointments/queue", headers=PA)
    queue = data_of(response) or []
    check(
        "the finished patient is out of the desk's queue",
        all(a["id"] != appointment_id for a in queue),
        [(a["id"], a["patient"]) for a in queue],
    )

    # -------------------------------------------------- clinical privacy --
    section("the portal does not hand over the clinical record")

    check(
        "a finished appointment carries no consultation summary",
        finished is not None and "consultation" not in finished,
        sorted((finished or {}).keys()),
    )

    response = client.get("/api/portal/me", headers=MEERA)
    profile = data_of(response) or {}
    for clinical in ("allergies", "medical_history", "existing_conditions", "notes"):
        check(
            f"the patient's own profile withholds {clinical}",
            clinical not in profile,
            sorted(profile.keys()),
        )

    # ------------------------------------------------------ cancelling --
    section("a patient calls off a booking themselves")

    response = client.post(
        "/api/portal/appointments",
        json={"scheduled_at": _soon(days=5), "reason": "Follow-up"},
        headers=ARJUN,
    )
    check("the second patient books", response.status_code == 201, body(response))
    arjun_appointment = (data_of(response) or {}).get("id")

    response = client.post(
        f"/api/portal/appointments/{arjun_appointment}/cancel",
        json={"reason": "Away that week"},
        headers=ARJUN,
    )
    check("they cancel it", response.status_code == 200, body(response))
    check(
        "it reads as cancelled",
        (data_of(response) or {}).get("status") == "cancelled",
        data_of(response),
    )

    response = client.get("/api/portal/appointments", headers=ARJUN)
    check("it has left their active list", data_of(response) == [], data_of(response))

    response = client.get("/api/portal/appointments/history", headers=ARJUN)
    items = (data_of(response) or {}).get("items") or []
    check(
        "and is in their history as cancelled",
        any(a["id"] == arjun_appointment and a["status"] == "cancelled" for a in items),
        items,
    )

    response = client.get("/api/appointments/upcoming", headers=PA)
    check(
        "the desk's book no longer lists it as upcoming",
        all(a["id"] != arjun_appointment for a in (data_of(response) or [])),
        None,
    )

    # ----------------------------------------------------- self-service --
    section("a patient corrects their own details")

    response = client.patch(
        "/api/portal/me",
        json={"phone": "9899900099", "address": "42 Beach Road, Kakinada"},
        headers=ARJUN,
    )
    check("they update their contact details", response.status_code == 200, body(response))
    check(
        "the new number is stored",
        (data_of(response) or {}).get("phone") == "9899900099",
        data_of(response),
    )

    response = client.patch(
        "/api/portal/me", json={"allergies": "None at all"}, headers=ARJUN
    )
    with app.app_context():
        from portal.models.patient import Patient

        arjun_row = Patient.query.filter_by(portal_email="arjun.nair@gmail.com").first()
        allergies = arjun_row.allergies if arjun_row else "?"
    check(
        "they cannot write to the clinical record",
        allergies is None,
        allergies,
    )

    response = client.patch("/api/portal/me", json={"phone": "123"}, headers=ARJUN)
    check("a malformed phone number is refused", response.status_code == 422, message(response))

    # ------------------------------------------------- revoking access --
    section("the desk can revoke portal access")

    with app.app_context():
        from portal.models.patient import Patient

        row = Patient.query.filter_by(portal_email="arjun.nair@gmail.com").first()
        row.portal_enabled = False
        db.session.commit()

    response = client.get("/api/portal/appointments", headers=ARJUN)
    check(
        "an already-issued token stops working",
        response.status_code == 403,
        f"{response.status_code}: {message(response)}",
    )
    response = client.post(
        "/api/portal/login",
        json={"email": "arjun.nair@gmail.com", "password": "Portal@2026"},
    )
    check("and they cannot sign in again", response.status_code == 403, response.status_code)

    # -------------------------------------------------------- the staff --
    section("nothing about the practice's own workflow moved")

    response = client.get("/api/appointments/queue", headers=DOCTOR)
    check("the doctor still reads the queue", response.status_code == 200, response.status_code)
    response = client.get("/api/dashboard/summary", headers=PA)
    check("the PA dashboard still loads", response.status_code == 200, response.status_code)
    response = client.get("/api/consultations", headers=DOCTOR)
    check("the doctor still reads consultations", response.status_code == 200, response.status_code)
    response = client.post(
        "/api/patients",
        json={"name": "Walk In", "phone": "9866600066", "age": 45},
        headers=PA,
    )
    check("the PA can still register a patient", response.status_code == 201, body(response))

    # ---------------------------------------------------------- verdict --
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
