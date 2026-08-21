"""The patient portal: what a patient can see and do about their own care.

  POST /portal/register              enrol, and claim your record
  POST /portal/login
  POST /portal/refresh
  GET  /portal/me                    who you are, and who your doctor is
  PATCH /portal/me                   correct your own contact details

  GET  /portal/appointments          what is still to happen
  GET  /portal/appointments/history  what has already happened
  POST /portal/appointments          book one
  POST /portal/appointments/<id>/cancel

Everything here is scoped to `current_portal_patient()` and nothing takes a
patient id from the caller — the token *is* the scope. A patient cannot ask
for somebody else's appointment because there is no parameter in which to ask.

One table, two audiences
------------------------

The appointment a patient books here is an ordinary row in `appointments`,
made by the same `helpers/queue_helper.book_appointment` the desk uses. That
is the whole synchronisation design, and it is deliberately not a
synchronisation *mechanism*: there is nothing to keep in step because there is
only one record. The doctor's queue and this list are two queries over the
same rows.

The same goes for the status. `GET /portal/appointments` selects
`OPEN_STATUSES` and `/history` selects `CLOSED_STATUSES` — the identical split
`appointment_routes` makes for the doctor, from the identical constants in
`models/appointment`. So when the doctor ends a consultation and
`complete_appointment_for` writes `completed`, the visit leaves this patient's
active list and appears in their history in the same instant it leaves the
doctor's queue, because it is one field changing under two readers. No second
write, no copy to reconcile, and no way for the two screens to disagree.

What a patient may *not* do here, and why
-----------------------------------------

**Check in.** Arrival is something the desk observes, not something the
patient asserts — the queue is ordered by it, and a patient who could stamp
their own `arrived_at` from the bus could take the head of a queue they are
not in.

**Read the clinical record.** A finished appointment shows that it happened
and whether a report is ready. It does not carry the consultation summary, the
AI's assistive diagnosis or the prescription: those are the doctor's account
of the visit, and the assistive ones are explicitly *drafts for a clinician*
until signed. `include_consultation=True` is what the doctor's history uses;
this route deliberately does not.
"""

from datetime import datetime, timedelta

from flask import Blueprint, request
from flask_jwt_extended import get_jwt, jwt_required

from portal.extensions import db
from portal.helpers.audit import audit
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.contact import normalize_email, normalize_phone
from portal.helpers.credentials import MIN_PASSWORD
from portal.helpers.datetime_helper import local_clock
from portal.helpers.notify import notify
from portal.helpers.portal_auth import (
    PORTAL_SCOPE,
    current_portal_patient,
    issue_portal_tokens,
    patient_id_from_identity,
    patient_only,
)
from portal.helpers.practice import practice_doctor, practice_name
from portal.helpers.queue_helper import book_appointment
from portal.helpers.response import error, success
from portal.models.appointment import CLOSED_STATUSES, OPEN_STATUSES, Appointment
from portal.models.patient import Patient
from portal.models.report import Report

portal_bp = Blueprint("portal", __name__)

PORTAL_REGISTERED = "portal.patient_enrolled"
PORTAL_APPOINTMENT_BOOKED = "portal.appointment_booked"
PORTAL_APPOINTMENT_CANCELLED = "portal.appointment_cancelled"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# How far ahead a patient may book. Long enough to be useful, short enough
# that the book does not fill with appointments nobody will remember making.
MAX_BOOKING_DAYS = 90

# Booking is refused inside this window. A patient booking for "in five
# minutes" is really a walk-in, and a walk-in is the desk's to raise — they
# are the ones who can see whether the person is actually standing there.
MIN_BOOKING_LEAD_MINUTES = 30


def _parse_dob(raw):
    """Returns (date, error). Empty is allowed — plenty of patients do not
    know theirs, which is why `patients.age_years` exists."""
    if not raw:
        return None, None
    try:
        return datetime.strptime(str(raw).strip(), "%Y-%m-%d").date(), None
    except ValueError:
        return None, "Date of birth must be in YYYY-MM-DD format"


def _parse_datetime(raw, field):
    """An ISO timestamp off the booking form. A trailing 'Z' is accepted and
    dropped, exactly as `appointment_routes._parse_datetime` does it — the
    browser sends UTC that way."""
    if not raw:
        return None, None
    text = str(raw).strip()
    if text.endswith("Z"):
        text = text[:-1]
    try:
        return datetime.fromisoformat(text), None
    except ValueError:
        return None, f"{field} must be an ISO date-time, e.g. 2026-08-20T10:30"


def _doctor_summary(doctor):
    """Who the patient is booked with, as the portal names them."""
    if not doctor:
        return None
    return {
        "id": doctor.id,
        "name": doctor.user.name if doctor.user else None,
        "specialization": doctor.specialization,
        "qualification": doctor.qualification,
        "practice_name": doctor.practice_name or practice_name(),
    }


def _report_ready(appointment):
    """Whether a signed report exists for this visit.

    The one clinical fact the portal does surface, and only as a yes/no: it is
    the answer to "is it ready yet?", which is the question that otherwise
    becomes a phone call to the desk. The document itself is still issued by
    the practice.
    """
    if not appointment.consultation_id:
        return False
    return (
        Report.query.filter_by(consultation_id=appointment.consultation_id).first()
        is not None
    )


def _appointment_view(appointment, *, include_report=False):
    """One appointment as the patient sees it.

    Built from `Appointment.to_dict()` so the status, the label and the times
    are literally the same values the doctor's screen renders — then narrowed.
    The patient's own name and photo go out because they identify the row on
    the doctor's screen, not on this one, and `doctor_id` is meaningless to a
    patient who is told the doctor's name instead.
    """
    data = appointment.to_dict()
    for staff_only in ("patient_detail", "doctor_id", "notes", "queue_number"):
        data.pop(staff_only, None)
    if include_report:
        data["report_ready"] = _report_ready(appointment)
    return data


# --------------------------------------------------------------------------
# enrolling and signing in
# --------------------------------------------------------------------------


def _claimable(patient, name, dob):
    """Whether the person filling in the form has shown enough to be the
    patient this record belongs to.

    A phone number is how the practice finds an existing record, and on its
    own it is not nearly enough to hand one over: numbers are known to
    families, employers and anyone who has ever been given one. So a second
    fact has to match as well — the date of birth where the record has one,
    and the name where it does not.

    Deliberately strict, because the failure mode is not "the patient has to
    ring the desk", it is "somebody else reads their appointments." The desk
    can always enrol a patient it has identified in person.
    """
    if patient.dob and dob:
        return patient.dob == dob
    # No date of birth on file to check against — fall back to the name,
    # compared the way a human would read it rather than byte for byte.
    return (patient.name or "").strip().lower() == (name or "").strip().lower()


@portal_bp.post("/register")
def register():
    """Enrols a patient in the portal.

    Two cases, and the difference matters. A patient the practice already
    knows — registered at the desk, seen before — *claims* their existing
    record, so their history and their upcoming appointments are there when
    they sign in. A patient the practice has never met gets a new record,
    assigned to the practice's doctor exactly as desk registration would
    assign it.

    Never a second record for somebody who already has one. That is the
    duplicate this whole route exists to prevent: two rows for one person
    means a doctor reading half a history.
    """
    payload = request.get_json(silent=True) or {}

    name = (payload.get("name") or "").strip()
    password = payload.get("password") or ""
    phone, phone_error = normalize_phone(payload.get("phone"))
    email, email_error = normalize_email(payload.get("email"))
    dob, dob_error = _parse_dob(payload.get("dob"))

    if not name:
        return error("Your name is required", status=422)
    if phone_error:
        return error(phone_error, status=422)
    if not phone:
        return error("A mobile number is required", status=422)
    if email_error:
        return error(email_error, status=422)
    if not email:
        return error("An email address is required — it is how you sign in", status=422)
    if dob_error:
        return error(dob_error, status=422)
    if len(password) < MIN_PASSWORD:
        return error(
            f"Choose a password of at least {MIN_PASSWORD} characters", status=422
        )

    if Patient.query.filter_by(portal_email=email).first():
        # Says only that this address cannot be used to enrol. Confirming that
        # an address already has an account would make this route a way to ask
        # whether a given person is a patient here.
        return error(
            "That email address cannot be used to register. If you already have "
            "an account, sign in instead.",
            status=409,
        )

    doctor = practice_doctor()
    if not doctor:
        return error(
            "This practice is not accepting online registrations yet.", status=409
        )

    existing = Patient.query.filter_by(phone=phone).order_by(Patient.id.asc()).first()

    if existing and existing.portal_password_hash:
        # Their record is already enrolled, under some other address. Same
        # deliberately unhelpful answer as above.
        return error(
            "That email address cannot be used to register. If you already have "
            "an account, sign in instead.",
            status=409,
        )

    if existing:
        if not _claimable(existing, name, dob):
            return error(
                "We already hold a record for that mobile number, but the details "
                "given do not match it. Please contact the practice to have your "
                "portal access set up.",
                status=409,
            )
        patient = existing
        # Their record is the practice's; enrolling does not license the
        # portal to rewrite the demographics on it. Only the blanks are
        # filled, and only where the patient has supplied something.
        if dob and not patient.dob:
            patient.dob = dob
        if not patient.email:
            patient.email = email
        claimed = True
    else:
        patient = Patient(
            name=name,
            phone=phone,
            email=email,
            dob=dob,
            assigned_doctor_id=doctor.id,
        )
        gender = (payload.get("gender") or "").strip().lower() or None
        if gender in ("male", "female", "other"):
            patient.gender = gender
        db.session.add(patient)
        claimed = False

    patient.portal_email = email
    patient.portal_enabled = True
    patient.set_portal_password(password)
    patient.portal_last_login_at = datetime.utcnow()

    db.session.flush()  # assigns patient.id for the audit row and the token

    audit(
        PORTAL_REGISTERED,
        entity="patient",
        entity_id=patient.id,
        detail=(
            f"{patient.name} claimed their record via the patient portal"
            if claimed
            else f"{patient.name} registered via the patient portal"
        ),
    )

    if not claimed and doctor.user_id:
        notify(
            [doctor.user_id],
            title="New patient registered online",
            body=f"{patient.name} has registered through the patient portal.",
            category="patient_assignment",
            link=f"/dashboard/patients/{patient.id}",
        )

    db.session.commit()
    dashboard_changed("portal_patient_registered")

    tokens = issue_portal_tokens(patient)
    return success(
        {**tokens, "patient": _me_payload(patient)},
        message="Welcome — your account is ready",
        status=201,
    )


@portal_bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or payload.get("identifier") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return error("Email and password are required", status=422)

    patient = Patient.query.filter_by(portal_email=email).first()
    # One message for "no such account", "wrong password" and "never enrolled",
    # so this cannot be used to find out who is a patient here.
    if not patient or not patient.check_portal_password(password):
        return error("Invalid email or password", status=401)
    if not patient.portal_enabled:
        return error(
            "Portal access for this account has been turned off. "
            "Please contact the practice.",
            status=403,
        )

    patient.portal_last_login_at = datetime.utcnow()
    db.session.commit()

    tokens = issue_portal_tokens(patient)
    return success(
        {**tokens, "patient": _me_payload(patient)}, message="Signed in"
    )


@portal_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    """A new access token from a refresh token.

    The portal's own, rather than `/api/auth/refresh`: that route mints a
    staff token from whatever identity it is handed, and the whole point of
    the two identity spaces is that neither can issue the other's credentials.
    """
    claims = get_jwt()
    if claims.get("scope") != PORTAL_SCOPE:
        return error("Sign in to the patient portal to use this.", status=403)

    patient_id = claims.get("patient_id") or patient_id_from_identity(claims.get("sub"))
    patient = Patient.query.get(patient_id) if patient_id else None
    if not patient or not patient.has_portal_access:
        return error("This account can no longer sign in", status=401)

    return success({"access_token": issue_portal_tokens(patient)["access_token"]})


# --------------------------------------------------------------------------
# the patient themselves
# --------------------------------------------------------------------------


def _me_payload(patient):
    """What the portal knows about the signed-in patient.

    Not `Patient.to_dict()`: that carries the clinical fields the desk and the
    doctor work from — allergies, medical history, existing conditions and the
    desk's own notes about them. Those are the practice's record *about* the
    patient, written by clinicians, and handing them back unmediated through
    an API is not the same thing as a doctor going through them in a room.
    """
    return {
        "id": patient.id,
        "code": patient.code,
        "name": patient.name,
        "gender": patient.gender,
        "dob": patient.dob.isoformat() if patient.dob else None,
        "age": patient.age,
        "phone": patient.phone,
        "email": patient.portal_email or patient.email,
        "address": patient.address,
        "photo_url": patient.photo_url,
        "emergency_contact_name": patient.emergency_contact_name,
        "emergency_contact_phone": patient.emergency_contact_phone,
        "doctor": _doctor_summary(patient.assigned_doctor or practice_doctor()),
        "practice_name": practice_name(),
    }


@portal_bp.get("/me")
@patient_only
def me():
    return success(_me_payload(current_portal_patient()))


@portal_bp.patch("/me")
@patient_only
def update_me():
    """Lets a patient correct their own contact details.

    Contact only. A patient may fix the number they are reached on; they may
    not edit their allergies, their conditions or their history, because those
    are clinical entries somebody qualified made and a record the doctor reads
    before prescribing has to be the doctor's.
    """
    patient = current_portal_patient()
    payload = request.get_json(silent=True) or {}

    if "phone" in payload:
        phone, phone_error = normalize_phone(payload.get("phone"))
        if phone_error:
            return error(phone_error, status=422)
        if not phone:
            return error("A mobile number is required", status=422)
        patient.phone = phone

    if "address" in payload:
        patient.address = (payload.get("address") or "").strip() or None

    if "emergency_contact_name" in payload:
        patient.emergency_contact_name = (
            payload.get("emergency_contact_name") or ""
        ).strip() or None

    if "emergency_contact_phone" in payload:
        contact, contact_error = normalize_phone(payload.get("emergency_contact_phone"))
        if contact_error:
            return error(contact_error, status=422)
        patient.emergency_contact_phone = contact

    db.session.commit()
    return success(_me_payload(patient), message="Your details have been updated")


# --------------------------------------------------------------------------
# appointments
# --------------------------------------------------------------------------


@portal_bp.get("/appointments")
@patient_only
def list_appointments():
    """Everything still to happen: booked, arrived, and with the doctor now.

    `OPEN_STATUSES` — the same constant `appointment_routes` filters the
    doctor's list on. A visit disappears from here the moment it closes,
    without this route knowing anything about consultations.
    """
    patient = current_portal_patient()
    # See appointment_routes: the two branches are on different clocks.
    when = db.func.coalesce(Appointment.scheduled_at, local_clock(Appointment.created_at))
    appointments = (
        Appointment.query.filter(
            Appointment.patient_id == patient.id,
            Appointment.status.in_(OPEN_STATUSES),
        )
        .order_by(when.asc(), Appointment.id.asc())
        .all()
    )
    return success([_appointment_view(a) for a in appointments])


@portal_bp.get("/appointments/history")
@patient_only
def appointment_history():
    """Visits that are over — completed, and ones that were called off.

    `CLOSED_STATUSES`, the exact complement of the list above, so an
    appointment is always in one of the two and never in both or neither.
    """
    patient = current_portal_patient()

    query = Appointment.query.filter(
        Appointment.patient_id == patient.id,
        Appointment.status.in_(CLOSED_STATUSES),
    )

    status = request.args.get("status")
    if status:
        if status not in CLOSED_STATUSES:
            return error(
                f"status must be one of: {', '.join(CLOSED_STATUSES)}", status=422
            )
        query = query.filter(Appointment.status == status)

    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    total = query.order_by(None).count()
    # See appointment_routes: the two branches are on different clocks.
    when = db.func.coalesce(Appointment.scheduled_at, local_clock(Appointment.created_at))
    rows = (
        query.order_by(when.desc(), Appointment.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return success(
        {
            "items": [_appointment_view(a, include_report=True) for a in rows],
            "meta": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": max(1, (total + page_size - 1) // page_size),
            },
        }
    )


@portal_bp.post("/appointments")
@patient_only
def create_appointment():
    """Books the signed-in patient in.

    Straight through `helpers/queue_helper.book_appointment`, which is what
    the desk's own booking calls. Everything that makes a booking correct —
    resolving the patient's doctor, refusing a double-booking inside the
    duplicate window, writing the audit line — happens because it is the same
    function, not because it was reimplemented here to match.

    No walk-in path. `walk_in=True` creates an appointment already checked in
    and standing in today's queue, and a patient cannot put themselves in a
    queue in a building they may not be in.
    """
    patient = current_portal_patient()
    payload = request.get_json(silent=True) or {}

    scheduled_at, when_error = _parse_datetime(payload.get("scheduled_at"), "scheduled_at")
    if when_error:
        return error(when_error, status=422)
    if not scheduled_at:
        return error("Choose a date and time for your appointment", status=422)

    # Two clocks, deliberately, because the two things being compared are
    # stored on different ones:
    #
    #   `scheduled_at` arrives from a `datetime-local` field -- the wall-clock
    #   time the patient picked, with no zone on it. It has to be judged
    #   against local time. Judging it against utcnow() silently scaled both
    #   guards by the practice's offset: at +05:30 the "30 minutes from now"
    #   floor accepted a slot five minutes away, or hours into the past,
    #   because the naive local number is simply the larger one.
    #
    #   `created_at`, which `book_appointment` measures its duplicate window
    #   against, is written by db.func.now() and is UTC. Handing it local time
    #   moves the cutoff into its future and matches nothing, which disables
    #   the duplicate check entirely.
    #
    # `helpers/datetime_helper` makes the same one-clinic-one-timezone
    # assumption everywhere it decides what "today" means.
    local_now = datetime.now()
    now = datetime.utcnow()
    if scheduled_at < local_now + timedelta(minutes=MIN_BOOKING_LEAD_MINUTES):
        return error(
            "Please choose a time at least "
            f"{MIN_BOOKING_LEAD_MINUTES} minutes from now. If you need to be seen "
            "today, call the practice.",
            status=422,
        )
    if scheduled_at > local_now + timedelta(days=MAX_BOOKING_DAYS):
        return error(
            f"Appointments can be booked up to {MAX_BOOKING_DAYS} days ahead.",
            status=422,
        )

    reason = (payload.get("reason") or "").strip() or None

    appointment, failure = book_appointment(
        patient,
        reason=reason,
        scheduled_at=scheduled_at,
        # No actor: the audit row records the role from the token, and a
        # portal identity is not a `users.id` — see `helpers/portal_auth`.
        actor_user_id=None,
        now=now,
    )
    if failure:
        # `book_appointment` refuses a second booking inside the duplicate
        # window and says so in terms the desk would use. Returned unchanged:
        # the reason is the same reason, and rewording it here would mean two
        # messages to keep true instead of one.
        return failure

    doctor = appointment.doctor
    if doctor and doctor.user_id:
        notify(
            [doctor.user_id],
            title="Appointment booked online",
            body=(
                f"{patient.name} booked for "
                f"{scheduled_at.strftime('%d %b %Y, %H:%M')} through the portal."
            ),
            category="appointment",
            link="/dashboard/appointments",
        )

    audit(
        PORTAL_APPOINTMENT_BOOKED,
        entity="appointment",
        entity_id=appointment.id,
        detail=f"{patient.name} booked online for {scheduled_at.strftime('%d %b %Y, %H:%M')}",
    )

    db.session.commit()
    # The same signal the desk's booking sends, so the doctor's Appointments
    # list redraws with this patient on it without anyone pressing refresh.
    dashboard_changed("appointment_created")

    return success(
        _appointment_view(appointment), message="Appointment booked", status=201
    )


@portal_bp.post("/appointments/<int:appointment_id>/cancel")
@patient_only
def cancel_appointment(appointment_id):
    """Lets a patient call off a booking they have not yet turned up for.

    Only while it is `scheduled`. Once they have been checked in they are in
    the building and in the queue, and once the doctor has called them in
    there is a consultation attached — at which point cancelling would leave a
    session recorded against a visit the book says never happened. That is the
    same rule `appointment_routes.cancel_appointment` applies to the desk,
    and for the same reason.
    """
    patient = current_portal_patient()
    appointment = Appointment.query.filter_by(
        id=appointment_id, patient_id=patient.id
    ).first()
    # 404 rather than 403 for somebody else's appointment: this must not
    # confirm that an appointment it will not show actually exists.
    if not appointment:
        return error("Appointment not found", status=404)

    if appointment.status == "cancelled":
        return success(_appointment_view(appointment), message="Already cancelled")
    if appointment.status == "completed":
        return error("This appointment has already taken place", status=409)
    if appointment.status != "scheduled":
        return error(
            "You are already checked in for this appointment. Please speak to "
            "the practice to cancel it.",
            status=409,
        )

    payload = request.get_json(silent=True) or {}
    appointment.status = "cancelled"
    appointment.cancelled_reason = (
        (payload.get("reason") or "").strip() or "Cancelled by the patient online"
    )

    doctor = appointment.doctor
    if doctor and doctor.user_id:
        notify(
            [doctor.user_id],
            title="Appointment cancelled online",
            body=f"{patient.name} cancelled their booking through the portal.",
            category="appointment",
            link="/dashboard/appointments",
        )

    audit(
        PORTAL_APPOINTMENT_CANCELLED,
        entity="appointment",
        entity_id=appointment.id,
        detail=f"{patient.name} cancelled {appointment.code} online",
    )

    db.session.commit()
    dashboard_changed("appointment_cancelled")

    return success(_appointment_view(appointment), message="Appointment cancelled")


@portal_bp.get("/doctor")
@patient_only
def my_doctor():
    """Who the patient is under. Read by the booking form, so it can say whose
    appointment is being made rather than presenting an unattributed slot."""
    patient = current_portal_patient()
    return success(_doctor_summary(patient.assigned_doctor or practice_doctor()))
