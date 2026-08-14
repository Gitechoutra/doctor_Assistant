import os
from datetime import datetime, timedelta

from flask import Blueprint, request, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.case_helper import (
    attach_to_case,
    case_for_new_session,
    open_case_for,
    todays_session,
)
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import role_required
from portal.helpers.patient_access import can_access_patient
from portal.helpers.patient_search import code_clauses, patient_search_filter
# The duplicate window and the OP-raising rules live in queue_helper, shared
# with patient registration. Re-exported here because this module is where
# they were first defined and other code imports them from it.
from portal.helpers.queue_helper import (  # noqa: F401
    DUPLICATE_WINDOW_MINUTES,
    op_department_for,
    raise_op,
    recent_duplicate_for,
    scope_appointments,
)
from portal.helpers.response import error, success
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.department import Department
from portal.models.emergency_case import EmergencyCase
from portal.models.patient import Patient
from portal.pdf.op_document_generator import generate_op_document_pdf

appointment_bp = Blueprint("appointments", __name__)

# Regenerated in place on every request rather than tracked in a table — an
# OP slip is a 1:1, always-reproducible view of its appointment, so there is
# nothing here worth a database row the way a signed-off prescription is.
OP_DOCUMENTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "op_documents")


def _op_document_path(appointment_id):
    return os.path.join(OP_DOCUMENTS_DIR, f"op_{appointment_id}.pdf")

# In the queue, and so what the dashboard's queue card counts: still on the
# board, i.e. not yet completed or cancelled.
OPEN_STATUSES = ("waiting", "in_progress")

# Off the board for good — nothing can be started from one of these. These are
# exactly the statuses the history below lists: the queue and the history are
# defined against the same constant, so an OP is always in one of the two and
# never in both.
CLOSED_STATUSES = ("completed", "cancelled")

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def collapse_duplicates(appointments):
    """Drops same-patient rows raised within `DUPLICATE_WINDOW_MINUTES` of the
    one being kept, preserving the caller's ordering.

    The refusal in `create_appointment` stops new ones being written; this is
    what keeps the pairs already in the database out of the queue, and it is
    applied on read so no migration has to guess which of two historic rows was
    the real registration.

    Which row survives: the one in consultation if there is one — that is the
    visit actually happening — otherwise the earliest, which is the patient's
    real place in the queue and the position the desk gave them. Deciding that
    here rather than trusting the incoming order means the dashboard's count and
    the page's rows collapse identically.
    """
    window = DUPLICATE_WINDOW_MINUTES * 60
    ranked = sorted(
        appointments,
        key=lambda a: (a.status != "in_progress", a.created_at or datetime.min),
    )

    kept_ids = set()
    last_kept = {}  # patient_id -> created_at of the row kept for them
    for appointment in ranked:
        created = appointment.created_at or datetime.min
        previous = last_kept.get(appointment.patient_id)
        if previous is not None and abs((created - previous).total_seconds()) < window:
            continue
        kept_ids.add(appointment.id)
        last_kept[appointment.patient_id] = created

    return [a for a in appointments if a.id in kept_ids]


def open_appointments_query():
    """Appointments still on the board — the one definition of "the queue",
    shared by the Appointments page and by the dashboard's queue card, so the
    number on the card always matches the rows behind it.

    The status check is the primary rule; the consultation check is a safety
    net. A row whose consultation is already completed must never appear in
    the queue even if its own status was somehow left open — that's the
    "completed patients never remain in Appointments" guarantee, enforced on
    read so no stale row can slip through.

    Deliberately *not* narrowed to appointments raised today. The queue is a
    work list, not a diary: a patient queued yesterday evening and never
    called in is still waiting this morning, and a consultation left running
    overnight is still running. Counting only rows with today's `created_at`
    hid exactly those patients from the dashboard card while the page it
    links to still listed them — the card read "0" over a queue that had
    people in it. An appointment can only ever be raised now or earlier, so
    "still open" already implies "still today's work"; there is no date
    window that could include a waiting patient without also including the
    ones who have been waiting longest.
    """
    return (
        Appointment.query.outerjoin(
            Consultation, Appointment.consultation_id == Consultation.id
        )
        .filter(
            Appointment.status.in_(OPEN_STATUSES),
            db.or_(Consultation.id.is_(None), Consultation.status != "completed"),
        )
    )


def _parse_range_date(raw, field):
    """Returns (date, error_message). `field` is the query param name, for
    the error text."""
    if not raw:
        return None, None
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date(), None
    except ValueError:
        return None, f"{field} must be in YYYY-MM-DD format"


@appointment_bp.get("")
@jwt_required()
def list_appointments():
    """The live queue: who is being seen, who is next, who is still waiting.

    Completed and cancelled appointments are left out by default — this is a
    work list, not a history. Pass ?status=completed (or cancelled) to look
    one of those up explicitly, or ?date_from=/?date_to= for a period lookup
    (any status) — used for a per-doctor patient count, never to narrow the
    live queue itself. The queue is deliberately never date-filtered (see
    open_appointments_query) — a patient still waiting from yesterday must
    never disappear because "today" was selected somewhere.
    """
    status = request.args.get("status")
    date_from, date_from_error = _parse_range_date(request.args.get("date_from"), "date_from")
    if date_from_error:
        return error(date_from_error, status=422)
    date_to, date_to_error = _parse_range_date(request.args.get("date_to"), "date_to")
    if date_to_error:
        return error(date_to_error, status=422)

    # ?filter=today was the dashboard card's link and is still accepted so
    # old links and bookmarks keep working. It no longer narrows anything:
    # the queue is every open appointment whatever day it was raised on (see
    # open_appointments_query), so this resolves to the same live queue.
    queue_requested = request.args.get("filter") == "today"

    is_lookup = (bool(status) or date_from or date_to) and not queue_requested
    if is_lookup:
        # An explicit status, or a date range, is a lookup rather than the
        # queue — it may return completed/cancelled rows, which the queue
        # never does.
        query = Appointment.query
        if status:
            query = query.filter(Appointment.status == status)
    else:
        query = open_appointments_query()
        if status:
            query = query.filter(Appointment.status == status)

    if date_from:
        query = query.filter(Appointment.created_at >= date_from)
    if date_to:
        query = query.filter(Appointment.created_at < date_to + timedelta(days=1))

    # A doctor's queue is strictly the OPs raised against them — see
    # _scope_to_caller, shared with the history route and the dashboard.
    doctor = get_current_doctor()
    query = _scope_to_caller(query)
    if not doctor:
        department_id = request.args.get("department_id", type=int)
        if department_id:
            query = query.filter(Appointment.department_id == department_id)

    appointments = query.order_by(
        # Whoever is in the room comes first, then the queue in the order
        # people actually joined it — oldest first, so the row under the
        # ongoing one is genuinely the next patient.
        db.case((Appointment.status == "in_progress", 0), else_=1),
        Appointment.created_at.asc(),
    ).all()

    # The queue shows one card per patient; a lookup is left whole, because
    # asking for every completed appointment and being handed a filtered
    # history would be a different thing than what was asked for.
    if not is_lookup:
        appointments = collapse_duplicates(appointments)

    # Queue numbers count the waiting only, so "Queue #1" always means next up.
    queue_position = 0
    payload = []
    for appointment in appointments:
        queue_number = None
        if appointment.status == "waiting":
            queue_position += 1
            queue_number = queue_position
        payload.append(appointment.to_dict(queue_number=queue_number))

    return success(payload)


def _scope_to_caller(query):
    """Narrows an appointment query the way the caller is allowed to see it.

    Thin wrapper over `scope_appointments`, which is shared with the dashboard
    so the queue, the OP history and the count that links to them can never
    disagree about whose OP is whose.
    """
    return scope_appointments(query, get_current_doctor())


@appointment_bp.get("/history")
@jwt_required()
def appointment_history():
    """Closed OPs — the ones that have left the queue — newest first.

    The counterpart to `list_appointments`: that route is the work list of
    patients still in the building, this one is the record of the ones who have
    been seen and cleared. Nothing is deleted when a consultation ends; the OP
    simply moves from one to the other, because `complete_appointment_for`
    flips its status and the two routes select on opposite halves of that same
    field.

    Each row carries the visit it produced -- summary, prescription, report --
    so a closed OP can be read here without hunting for its consultation.

    Duplicate registrations are deliberately *not* collapsed the way the queue
    collapses them. The queue hides a double-registration because it must draw
    one card per patient waiting; the history is the record of what was
    actually raised, and quietly dropping a row from it would make the desk's
    own audit trail disagree with the database.
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

    query = _scope_to_caller(query)

    # The patient join is already there for a doctor (see _scope_to_caller) but
    # not for reception, and joining twice would alias the table into a
    # cartesian product — so the patient half goes through the relationship,
    # which expresses the same filter as a subquery either way. Half a name is
    # enough, in any case, and "OP0123" finds the OP itself.
    search = patient_search_filter(
        request.args.get("search"),
        columns=(Appointment.reason,),
        extra=lambda term: code_clauses(term, "op", Appointment.id),
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


@appointment_bp.post("")
@role_required("receptionist")
def create_appointment():
    # The front desk, and only the front desk.
    #
    # Not doctors: registering a patient for an OP visit is intake work, not
    # something a doctor should self-serve — that keeps the department queues
    # an honest reflection of who actually walked in.
    #
    # Not admins either, which is narrower than the FRONT_DESK_ROLES used by
    # the patient-routing endpoints. Admin is a monitoring and administration
    # role: it reads the queue and the appointment book, but calling a patient
    # in is an operational act belonging to the desk. Raising an OP from an
    # admin account would put a visit into a department queue that no
    # receptionist knows about.
    #
    # FRONT_DESK_ROLES deliberately still includes admin for reassigning and
    # removing a registration (patient_routes) — those are corrections to bad
    # data, which is administration.
    payload = request.get_json(silent=True) or {}
    patient_id = payload.get("patient_id")
    department_id = payload.get("department_id")

    if not patient_id or not department_id:
        return error("patient_id and department_id are required", status=422)

    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    department = Department.query.get(department_id)
    if not department:
        return error("Department not found", status=404)

    # This route takes the department explicitly, so the one thing it has to
    # check for itself is that the caller named the right one. Everything after
    # that -- which department an OP actually belongs in, the duplicate window,
    # the billing rule, who gets notified -- is `raise_op`, shared with
    # registration so the two ways of raising an OP cannot drift apart.
    assigned_department, failure = op_department_for(patient)
    if failure:
        return failure
    if assigned_department.id != department.id:
        doctor = patient.assigned_doctor
        return error(
            f"This patient is assigned to Dr. {doctor.user.name if doctor.user else 'their doctor'} "
            f"in {assigned_department.name} — the OP must be created in that department",
            status=422,
        )

    appointment, failure = raise_op(
        patient,
        reason=payload.get("reason"),
        actor_user_id=get_jwt_identity(),
    )
    if failure:
        return failure

    # An emergency case for this patient with no OP linked yet gets this one
    # automatically — the "OP raised later" step of the emergency workflow,
    # so the full history stays connected without reception having to
    # remember a separate linking step. Most recent unlinked case, in case
    # more than one somehow exists.
    open_emergency = (
        EmergencyCase.query.filter(
            EmergencyCase.patient_id == patient_id,
            EmergencyCase.linked_appointment_id.is_(None),
            EmergencyCase.status != "cancelled",
        )
        .order_by(EmergencyCase.id.desc())
        .first()
    )
    if open_emergency:
        open_emergency.linked_appointment_id = appointment.id

    db.session.commit()
    dashboard_changed("appointment_created")

    return success(appointment.to_dict(), message="OP created", status=201)


def _link_to_consultation(appointment, consultation, doctor, status):
    """Points an appointment at the session it belongs to and moves it on.

    Every path out of `start_appointment` other than an outright refusal ends
    here, so an appointment the doctor has acted on never stays behind in the
    queue on its original status.
    """
    appointment.doctor_id = doctor.id
    appointment.consultation_id = consultation.id
    appointment.status = status
    return appointment


@appointment_bp.post("/<int:appointment_id>/start")
@jwt_required()
def start_appointment(appointment_id):
    """Calls the patient in: opens their consultation room and moves the
    appointment to `in_progress`.

    Deliberately idempotent. Every reason a session might already exist —
    the doctor picked this patient up on another tab, the front desk raised a
    second OP for a visit already under way, the patient was seen earlier the
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
        return error("Only doctors can start appointments", status=403)
    if doctor.department_id != appointment.department_id:
        return error("This appointment belongs to a different department", status=403)
    if not can_access_patient(appointment.patient, doctor):
        return error("This patient is assigned to another doctor", status=403)

    # Already picked up, by this doctor, with a room to go back to: pressing
    # start again is the same action as resuming, so it opens that room.
    if appointment.consultation_id and appointment.consultation:
        return success(
            appointment.consultation.to_dict(include_detail=True),
            message="Consultation resumed",
        )

    # A patient coming back for more of the same treatment continues their
    # open case, so this becomes session 2 (3, …) rather than a fresh visit
    # that loses sight of the earlier ones. Nothing already recorded is
    # touched — the previous session keeps its own transcript, summary and
    # prescription.
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
    # session rather than getting a second one. Same rule as starting a
    # session directly — enforced here too, or the front desk raising another
    # OP would quietly split one visit into two half-records.
    todays = todays_session(existing)
    if todays:
        # The visit already happened today, so this OP is closed off against
        # that session rather than left waiting for a consultation that must
        # never be created. The doctor is taken to it, where "Continue
        # consultation" reopens recording on the same record.
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

    return success(consultation.to_dict(include_detail=True), message="Appointment started")


@appointment_bp.post("/<int:appointment_id>/op-document")
@role_required("receptionist")
def generate_op_document(appointment_id):
    """Renders this OP's registration slip — reception's own document, so
    reception is who generates it, same gate as raising the OP itself."""
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)

    os.makedirs(OP_DOCUMENTS_DIR, exist_ok=True)
    try:
        generate_op_document_pdf(appointment, _op_document_path(appointment.id))
    except Exception as exc:  # noqa: BLE001 - surface PDF generation failure
        return error(f"Could not generate OP document: {exc}", status=500)

    return success(appointment.to_dict(), message="OP document generated", status=201)


@appointment_bp.get("/<int:appointment_id>/op-document/download")
@jwt_required()
def download_op_document(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return error("Appointment not found", status=404)
    if not can_access_patient(appointment.patient, get_current_doctor()):
        # Deliberately 404, not 403 — same convention as the patient routes,
        # so this never confirms another doctor's patient exists.
        return error("Appointment not found", status=404)

    path = _op_document_path(appointment.id)
    if not os.path.exists(path):
        return error("OP document has not been generated yet", status=404)

    patient_name = (appointment.patient.name if appointment.patient else "patient").replace(" ", "_")
    return send_file(
        path, as_attachment=True, download_name=f"{patient_name}_OP_{appointment.code}.pdf"
    )
