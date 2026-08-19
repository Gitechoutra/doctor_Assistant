"""The appointment book and the day's queue.

Two views of the same rows, and the split is what makes the two roles work
together without stepping on each other:

  GET  /appointments/queue      who is here, in order. Both roles.
  GET  /appointments/upcoming   what is booked ahead. Both roles.
  GET  /appointments/history    what has been seen or cancelled. Both roles.

  POST /appointments            book one                     PA
  POST /appointments/<id>/check-in    they have arrived      PA
  PATCH /appointments/<id>      reschedule / edit            PA
  POST /appointments/<id>/cancel                             PA
  POST /appointments/<id>/start call them in                 doctor

The doctor's only write here is `start` -- calling the patient in is the one
queue action that is clinical rather than administrative. Everything else is
the desk's, and the doctor is deliberately outside it: a doctor who could book
their own appointments would make the PA's book stop being a true record of
who is coming.
"""

import os
from datetime import datetime, timedelta

from flask import Blueprint, request, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.case_helper import (
    attach_to_case,
    case_for_new_session,
    open_case_for,
    todays_session,
)
from portal.helpers.datetime_helper import local_day_bounds
from portal.helpers.decorators import front_desk_only
from portal.helpers.patient_access import can_access_patient
from portal.helpers.patient_search import code_clauses, patient_search_filter
from portal.helpers.practice import practice_doctor
from portal.helpers.queue_helper import (
    add_to_todays_queue,
    book_appointment,
    check_in,
    collapse_duplicates,
    number_queue,
    queue_query,
    scope_appointments,
    upcoming_query,
)
from portal.helpers.response import error, success
from portal.models.appointment import CLOSED_STATUSES, Appointment
from portal.models.consultation import Consultation
from portal.models.patient import Patient
from portal.pdf.appointment_slip_generator import generate_appointment_slip_pdf

appointment_bp = Blueprint("appointments", __name__)

# Regenerated in place on every request rather than tracked in a table — an
# appointment slip is a 1:1, always-reproducible view of its appointment, so
# there is nothing here worth a database row the way a signed prescription is.
SLIPS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "appointment_slips")

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def _slip_path(appointment_id):
    return os.path.join(SLIPS_DIR, f"appointment_{appointment_id}.pdf")


def _queue_position(appointment, doctor):
    """Where `appointment` sits in today's queue right now, the same way
    `/queue` computes it — so a number handed back from booking or checking a
    patient in always agrees with the board."""
    numbered = number_queue(collapse_duplicates(queue_query(doctor).all()))
    return next((n for a, n in numbered if a.id == appointment.id), None)


def _parse_range_date(raw, field):
    """Returns (date, error_message). `field` is the query param name, for
    the error text."""
    if not raw:
        return None, None
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date(), None
    except ValueError:
        return None, f"{field} must be in YYYY-MM-DD format"


def _parse_datetime(raw, field):
    """Returns (datetime, error_message) for an ISO timestamp off the form.

    A trailing 'Z' is accepted and dropped: the browser sends UTC that way and
    `fromisoformat` refuses it on Python versions before 3.11, which would make
    booking fail on exactly the input the frontend produces.
    """
    if not raw:
        return None, None
    text = str(raw).strip()
    if text.endswith("Z"):
        text = text[:-1]
    try:
        return datetime.fromisoformat(text), None
    except ValueError:
        return None, f"{field} must be an ISO date-time, e.g. 2026-08-20T10:30"


# A booking a few minutes either side of "now" is a walk-in being entered as
# the patient stands there, not a mistake, and the browser's clock is not the
# server's to the second. Anything older than this is a slip -- a mistyped
# year, or yesterday's date left in the field -- and a booking in the past is
# never actionable: it cannot be checked in from the Upcoming tab, so it would
# sit in the book forever.
PAST_BOOKING_GRACE = timedelta(minutes=15)


def _reject_past(when, field):
    """Returns an error message if `when` is meaningfully in the past.

    Naive local time throughout, matching what `datetime-local` sends and what
    `helpers/datetime_helper` already assumes about this practice: one clinic,
    one timezone, so a wall-clock comparison is the honest one.
    """
    if when is None:
        return None
    if when < datetime.now() - PAST_BOOKING_GRACE:
        return (
            f"{field} is in the past. Book a future slot, or mark it as a "
            "walk-in if the patient is here now."
        )
    return None


# --------------------------------------------------------------------------
# reading
# --------------------------------------------------------------------------


@appointment_bp.get("/queue")
@jwt_required()
def list_queue():
    """Today's queue, numbered.

    The one endpoint both roles read for "who is here". The PA's queue board
    and the doctor's queue are the same list — that is the point, and it is why
    the numbering is computed here rather than by either client. A patient told
    "you are third" at the desk has to be third on the doctor's screen too.
    """
    doctor = get_current_doctor()
    appointments = collapse_duplicates(queue_query(doctor).all())
    numbered = number_queue(appointments)
    return success([a.to_dict(queue_number=n) for a, n in numbered])


@appointment_bp.get("/upcoming")
@jwt_required()
def list_upcoming():
    """Booked, not yet arrived. The appointment book looking forwards.

    `?days=` bounds it (default 30). Bookings with no time at all are always
    included: they are the ones most likely to be forgotten, and a window can
    never contain a null.
    """
    doctor = get_current_doctor()
    try:
        days = max(1, min(int(request.args.get("days", 30)), 365))
    except (TypeError, ValueError):
        days = 30

    horizon = datetime.utcnow() + timedelta(days=days)
    query = upcoming_query(doctor).filter(
        db.or_(Appointment.scheduled_at.is_(None), Appointment.scheduled_at <= horizon)
    )
    return success([a.to_dict() for a in query.all()])


@appointment_bp.get("")
@jwt_required()
def list_appointments():
    """The appointment book, filterable.

    `?status=` narrows to one status, `?date_from=`/`?date_to=` to a period
    (against the booked time, falling back to when the row was made). With no
    filter at all this is every appointment that has not been closed — which
    is the book, not the queue. `/queue` is the queue.
    """
    status = request.args.get("status")
    if status and status not in dict.fromkeys(
        ("scheduled", "waiting", "in_progress", "completed", "cancelled")
    ):
        return error("Unknown status", status=422)

    date_from, date_from_error = _parse_range_date(request.args.get("date_from"), "date_from")
    if date_from_error:
        return error(date_from_error, status=422)
    date_to, date_to_error = _parse_range_date(request.args.get("date_to"), "date_to")
    if date_to_error:
        return error(date_to_error, status=422)

    query = Appointment.query
    if status:
        query = query.filter(Appointment.status == status)
    else:
        query = query.filter(Appointment.status.notin_(CLOSED_STATUSES))

    # Booked time where there is one, creation time otherwise — so a walk-in
    # and a booking both land in the day they actually belong to.
    when = db.func.coalesce(Appointment.scheduled_at, Appointment.created_at)
    if date_from:
        query = query.filter(when >= date_from)
    if date_to:
        query = query.filter(when < date_to + timedelta(days=1))

    query = scope_appointments(query, get_current_doctor())

    search = patient_search_filter(
        request.args.get("search"),
        columns=(Appointment.reason,),
        extra=lambda term: code_clauses(term, "apt", Appointment.id),
        relationship=Appointment.patient,
    )
    if search is not None:
        query = query.filter(search)

    appointments = query.order_by(when.asc(), Appointment.id.asc()).all()
    return success([a.to_dict() for a in appointments])


@appointment_bp.get("/history")
@jwt_required()
def appointment_history():
    """Appointments that have left the queue — seen or cancelled — newest first.

    The counterpart to `/queue`: that route is the work list of patients still
    in the building, this one is the record of the ones who have been seen and
    cleared. Nothing is deleted when a consultation ends; the appointment
    simply moves from one to the other, because `complete_appointment_for`
    flips its status and the two routes select on opposite halves of that same
    field.

    Each row carries the visit it produced — summary, prescription, report — so
    a closed appointment can be read here without hunting for its consultation.

    Duplicate bookings are deliberately *not* collapsed the way the queue
    collapses them. The queue hides a double-booking because it must draw one
    card per patient waiting; the history is the record of what was actually
    raised, and quietly dropping a row from it would make the desk's own audit
    trail disagree with the database.
    """
    query = Appointment.query.outerjoin(
        Consultation, Appointment.consultation_id == Consultation.id
    ).filter(Appointment.status.in_(CLOSED_STATUSES))

    status = request.args.get("status")
    if status:
        if status not in CLOSED_STATUSES:
            allowed = ", ".join(CLOSED_STATUSES)
            return error(f"status must be one of: {allowed}", status=422)
        query = query.filter(Appointment.status == status)

    date_from, date_from_error = _parse_range_date(request.args.get("date_from"), "date_from")
    if date_from_error:
        return error(date_from_error, status=422)
    date_to, date_to_error = _parse_range_date(request.args.get("date_to"), "date_to")
    if date_to_error:
        return error(date_to_error, status=422)
    if date_from:
        query = query.filter(Appointment.created_at >= date_from)
    if date_to:
        query = query.filter(Appointment.created_at < date_to + timedelta(days=1))

    query = scope_appointments(query, get_current_doctor())

    patient_id = request.args.get("patient_id", type=int)
    if patient_id:
        query = query.filter(Appointment.patient_id == patient_id)

    # The patient half goes through the relationship rather than a second
    # join, which would alias the table into a cartesian product. Half a name
    # is enough, and "APT0123" finds the appointment itself.
    search = patient_search_filter(
        request.args.get("search"),
        columns=(Appointment.reason,),
        extra=lambda term: code_clauses(term, "apt", Appointment.id),
        relationship=Appointment.patient,
    )
    if search is not None:
        query = query.filter(search)

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
    appointments = (
        query.order_by(Appointment.created_at.desc(), Appointment.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return success(
        {
            "items": [a.to_dict(include_consultation=True) for a in appointments],
            "meta": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": max(1, (total + page_size - 1) // page_size),
            },
        }
    )


# --------------------------------------------------------------------------
# the desk's actions
# --------------------------------------------------------------------------


@appointment_bp.post("")
@front_desk_only
def create_appointment():
    """Books a patient in.

    `walk_in: true` means they are standing at the desk now. Idempotent, and
    smarter than a plain insert about how they get into today's queue —
    already there, booked for today and not yet checked in, or neither — see
    `add_to_todays_queue` for the three cases and why pressing this twice, or
    two desks pressing it for the same patient at once, cannot double-book
    them: whichever request commits second finds the first's row already
    queued and returns that instead of raising a duplicate.

    This is also what "Generate Queue" on a patient's record calls (through
    this same endpoint, same as every other walk-in) for someone registered
    earlier — by phone, or simply ahead of arriving — who has just come in the
    door with no booking behind them at all.

    Without `walk_in`, `scheduled_at` is when they are expected, and they join
    the queue when the PA checks them in on the day.

    The doctor is not a parameter: there is one, and `book_appointment`
    resolves it. Everything else — the duplicate window, who gets notified, the
    audit line — is `book_appointment` too, shared with registration so the
    ways of booking cannot drift apart.
    """
    payload = request.get_json(silent=True) or {}
    patient_id = payload.get("patient_id")
    if not patient_id:
        return error("patient_id is required", status=422)

    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    walk_in = bool(payload.get("walk_in"))
    scheduled_at, when_error = _parse_datetime(payload.get("scheduled_at"), "scheduled_at")
    if when_error:
        return error(when_error, status=422)
    if not walk_in and not scheduled_at:
        return error(
            "Give a date and time for the appointment, or mark it as a walk-in.",
            status=422,
        )
    # Only for a booking: a walk-in ignores `scheduled_at` entirely and joins
    # today's queue at whatever time it actually is.
    if not walk_in:
        past_error = _reject_past(scheduled_at, "scheduled_at")
        if past_error:
            return error(past_error, status=422)

    reason = (payload.get("reason") or "").strip() or None
    notes = (payload.get("notes") or "").strip() or None

    if walk_in:
        appointment, outcome, failure = add_to_todays_queue(
            patient, reason=reason, notes=notes, actor_user_id=get_jwt_identity()
        )
        if failure:
            return failure

        # "existing" wrote nothing — the patient was already on the board —
        # so there is nothing to commit or to tell other screens changed.
        if outcome != "existing":
            db.session.commit()
            dashboard_changed(
                "appointment_checked_in" if outcome == "checked_in" else "appointment_created"
            )

        position = _queue_position(appointment, practice_doctor())
        message = {
            "existing": "Already in today's queue",
            "checked_in": "Checked in and added to today's queue",
            "created": "Patient added to today's queue",
        }[outcome]
        return success(
            appointment.to_dict(queue_number=position),
            message=message,
            status=201 if outcome == "created" else 200,
        )

    appointment, failure = book_appointment(
        patient,
        reason=reason,
        notes=notes,
        scheduled_at=scheduled_at,
        actor_user_id=get_jwt_identity(),
    )
    if failure:
        return failure

    db.session.commit()
    dashboard_changed("appointment_created")

    return success(appointment.to_dict(), message="Appointment booked", status=201)


@appointment_bp.post("/<int:appointment_id>/check-in")
@front_desk_only
def check_in_appointment(appointment_id):
    """The booked patient has arrived. This is what puts them in the queue."""
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)
    if appointment.status in CLOSED_STATUSES:
        return error("This appointment is already closed", status=409)
    if appointment.status != "scheduled":
        # Already in the queue. Idempotent rather than an error: a second press
        # at the desk must not move the patient's place in the line.
        return success(appointment.to_dict(), message="Already checked in")

    check_in(appointment, actor_user_id=get_jwt_identity())
    db.session.commit()
    dashboard_changed("appointment_checked_in")

    return success(appointment.to_dict(), message="Checked in")


@appointment_bp.patch("/<int:appointment_id>")
@front_desk_only
def update_appointment(appointment_id):
    """Reschedules an appointment, or corrects its reason and notes.

    Only a booking that has not started can be moved. Once the patient has
    arrived, "reschedule" is not a correction to a booking any more — it is
    cancelling this visit and making another, and the desk should say so
    explicitly rather than have a time quietly rewritten under a patient who is
    sitting in the waiting room.
    """
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)

    payload = request.get_json(silent=True) or {}
    rescheduling = "scheduled_at" in payload

    if rescheduling and appointment.status != "scheduled":
        return error(
            "This patient has already arrived, so the booking cannot be moved. "
            "Cancel this appointment and book a new one instead.",
            status=409,
        )
    if appointment.status in CLOSED_STATUSES:
        return error("This appointment is already closed", status=409)

    if rescheduling:
        scheduled_at, when_error = _parse_datetime(payload.get("scheduled_at"), "scheduled_at")
        if when_error:
            return error(when_error, status=422)
        if not scheduled_at:
            return error("Give a date and time to move the appointment to", status=422)
        past_error = _reject_past(scheduled_at, "scheduled_at")
        if past_error:
            return error(past_error, status=422)
        appointment.scheduled_at = scheduled_at

    if "reason" in payload:
        appointment.reason = (payload.get("reason") or "").strip() or None
    if "notes" in payload:
        appointment.notes = (payload.get("notes") or "").strip() or None

    db.session.commit()
    dashboard_changed("appointment_updated")

    return success(
        appointment.to_dict(),
        message="Appointment rescheduled" if rescheduling else "Appointment updated",
    )


@appointment_bp.post("/<int:appointment_id>/cancel")
@front_desk_only
def cancel_appointment(appointment_id):
    """Calls an appointment off.

    A cancelled row stays on file rather than being deleted: it is the record
    that the patient was expected and did not come, which is exactly what the
    desk needs when they ring to rebook.

    Refused once the doctor has started: there is a consultation attached by
    then, and cancelling around it would leave a session recorded against a
    visit the book says never happened.
    """
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)
    if appointment.status == "cancelled":
        return success(appointment.to_dict(), message="Already cancelled")
    if appointment.status == "completed":
        return error("This appointment has already been completed", status=409)
    if appointment.status == "in_progress":
        return error(
            "This consultation is already under way and cannot be cancelled.",
            status=409,
        )

    payload = request.get_json(silent=True) or {}
    appointment.status = "cancelled"
    appointment.cancelled_reason = (payload.get("reason") or "").strip() or None
    db.session.commit()
    dashboard_changed("appointment_cancelled")

    return success(appointment.to_dict(), message="Appointment cancelled")


# --------------------------------------------------------------------------
# the doctor's action
# --------------------------------------------------------------------------


def _link_to_consultation(appointment, consultation, doctor, status):
    """Points an appointment at the session it belongs to and moves it on.

    Every path out of `start_appointment` other than an outright refusal ends
    here, so an appointment the doctor has acted on never stays behind in the
    queue on its original status.
    """
    appointment.doctor_id = doctor.id
    appointment.consultation_id = consultation.id
    appointment.status = status
    if appointment.arrived_at is None:
        # Called straight in from a booking without passing the desk. The queue
        # filters on arrival, so without this the patient would vanish from the
        # very board they are at the head of.
        appointment.arrived_at = datetime.utcnow()
    return appointment


@appointment_bp.post("/<int:appointment_id>/start")
@jwt_required()
def start_appointment(appointment_id):
    """Calls the patient in: opens their consultation and moves the appointment
    to `in_progress`.

    Deliberately idempotent. Every reason a session might already exist — the
    doctor picked this patient up in another tab, the desk booked a second
    appointment for a visit already under way, the patient was seen earlier the
    same day — resolves to *that* session rather than to an error, because a
    refusal here used to leave the appointment sitting in the queue on
    "waiting" with no action left that could ever clear it.
    """
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)
    if appointment.status in CLOSED_STATUSES:
        return error("This appointment is already closed", status=409)

    doctor = get_current_doctor()
    if not doctor:
        return error("Only the doctor can start a consultation", status=403)
    if not can_access_patient(appointment.patient, doctor):
        return error("This patient is not on your list", status=403)

    # Already picked up, with a room to go back to: pressing start again is the
    # same action as resuming, so it opens that room.
    if appointment.consultation_id and appointment.consultation:
        return success(
            appointment.consultation.to_dict(include_detail=True),
            message="Consultation resumed",
        )

    # A patient coming back for more of the same treatment continues their open
    # case, so this becomes session 2 (3, …) rather than a fresh visit that
    # loses sight of the earlier ones. Nothing already recorded is touched —
    # the previous session keeps its own transcript, summary and prescription.
    #
    # Checked before anything is created: a patient queued twice while already
    # in the room would otherwise leave the case with two open sessions, and
    # nothing could then say which one a recording belongs to.
    existing = open_case_for(appointment.patient_id, doctor.id)
    running = existing.open_session if existing else None
    if running:
        # The session already open with this patient *is* this visit, so the
        # appointment joins it and the doctor lands in the room that is
        # recording. Both rows complete together when the session ends.
        _link_to_consultation(appointment, running, doctor, "in_progress")
        db.session.commit()
        dashboard_changed("consultation_started")
        return success(
            running.to_dict(include_detail=True),
            message=f"Resumed session {running.session_number} with this patient",
        )

    # A session is one visit, so a patient seen earlier today continues that
    # session rather than getting a second one. Enforced here too, or the desk
    # booking another appointment would quietly split one visit into two
    # half-records.
    todays = todays_session(existing)
    if todays:
        _link_to_consultation(appointment, todays, doctor, "completed")
        db.session.commit()
        dashboard_changed("consultation_started")
        return success(
            todays.to_dict(include_detail=True),
            message=(
                f"This patient was already seen today in session {todays.session_number} — "
                "continue that consultation rather than starting another."
            ),
        )

    case = case_for_new_session(appointment.patient_id, doctor.id, appointment.reason)

    consultation = Consultation(
        doctor_id=doctor.id,
        patient_id=appointment.patient_id,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    attach_to_case(consultation, case)
    db.session.add(consultation)
    db.session.flush()  # assigns consultation.id before we reference it below

    # The appointment moves to "in consultation" in the same commit as the
    # session it belongs to, so the queue can never show a patient as waiting
    # while their consultation is already recording.
    _link_to_consultation(appointment, consultation, doctor, "in_progress")
    db.session.commit()
    dashboard_changed("consultation_started")

    return success(consultation.to_dict(include_detail=True), message="Consultation started")


# --------------------------------------------------------------------------
# the slip
# --------------------------------------------------------------------------


@appointment_bp.post("/<int:appointment_id>/slip")
@front_desk_only
def generate_slip(appointment_id):
    """Renders this appointment's slip for the patient to take away — the
    desk's own document, so the desk is who generates it."""
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)

    os.makedirs(SLIPS_DIR, exist_ok=True)
    try:
        generate_appointment_slip_pdf(appointment, _slip_path(appointment.id))
    except Exception as exc:  # noqa: BLE001 - surface PDF generation failure
        return error(f"Could not generate the appointment slip: {exc}", status=500)

    return success(appointment.to_dict(), message="Appointment slip generated", status=201)


@appointment_bp.get("/<int:appointment_id>/slip/download")
@jwt_required()
def download_slip(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)
    if not can_access_patient(appointment.patient, get_current_doctor()):
        # Deliberately 404, not 403 — same convention as the patient routes, so
        # this never confirms that a record it will not show actually exists.
        return error("Appointment not found", status=404)

    path = _slip_path(appointment.id)
    if not os.path.exists(path):
        return error("This appointment slip has not been generated yet", status=404)

    patient_name = (
        appointment.patient.name if appointment.patient else "patient"
    ).replace(" ", "_")
    return send_file(
        path, as_attachment=True, download_name=f"{patient_name}_{appointment.code}.pdf"
    )


# --------------------------------------------------------------------------
# counts, for the dashboards
# --------------------------------------------------------------------------


def todays_completed_count(doctor=None):
    """Consultations finished today. Both dashboards read it, so it is defined
    once here rather than twice with a chance of disagreeing.

    Counted on `Consultation.ended_at` -- when the visit was actually
    finished. It used to count completed *appointments* by `arrived_at`, which
    is when the patient walked in, and the two are not the same day often
    enough to matter: a patient seen late who is written up after midnight,
    or a consultation left open overnight and ended the next morning, was
    counted on the day they arrived and so never appeared on the day the
    doctor finished them. The card then disagreed with the Consultations page
    it links to, which has always dated a visit by its end.

    Counting the consultation rather than the appointment also settles the
    double-count: a patient booked twice for one visit has two appointment
    rows pointing at the same session (see `complete_appointment_for`), and
    they are one completed consultation, not two.
    """
    day_start, day_end = local_day_bounds()
    query = Consultation.query.filter(
        Consultation.status == "completed",
        Consultation.ended_at >= day_start,
        Consultation.ended_at <= day_end,
    )
    if doctor:
        query = query.filter(Consultation.doctor_id == doctor.id)
    return query.count()


def practice_doctor_summary():
    """Who the practice's doctor is, for a client that wants to name them."""
    doctor = practice_doctor()
    return doctor.to_dict() if doctor else None
