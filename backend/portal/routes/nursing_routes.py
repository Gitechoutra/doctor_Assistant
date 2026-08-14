"""The nursing module's API.

Everything here hangs off a `NursingAssignment` — the doctor's hand-off of a
patient to a nurse for the observation period. Reads are scoped by
`nursing_access`; writes are split deliberately:

  * the **doctor** owns the plan — who is assigned, the care instructions,
    which medications are ordered, and when the watch ends
  * the **nurse** owns the record — doses given, vitals taken, notes written,
    alerts raised

Neither side can edit the other's half, which is what makes the log an audit
trail rather than a shared scratchpad.
"""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, request
from flask_jwt_extended import get_jwt, get_jwt_identity

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor, get_current_nurse
from portal.helpers.audit import (
    ALERT_ANSWERED,
    ALERT_RAISED,
    HANDOVER,
    MEDICATION_ADMINISTERED,
    MEDICATION_ORDERED,
    MESSAGE_SENT,
    NOTE_ADDED,
    NURSING_ASSIGNED,
    NURSING_CLOSED,
    NURSING_UPDATED,
    OBSERVATION_RECORDED,
    audit,
)
from portal.helpers.broadcast import dashboard_changed, nursing_changed
from portal.helpers.contact import normalize_email
from portal.helpers.credentials import unique_username
from portal.helpers.datetime_helper import to_utc_iso
from portal.helpers.decorators import clinical_only, role_required
from portal.helpers.formulary import prescribable_for, resolve_medicine
from portal.helpers.notify import notify
from portal.helpers.nursing_access import (
    can_record_on,
    can_view_assignment,
    scope_assignments,
)
from portal.helpers.patient_access import can_access_patient
from portal.helpers.response import error, success
from portal.helpers.surgery import refresh_for_assignments
from portal.models.care_message import CareMessage
from portal.models.clinical_alert import (
    ALERT_STATUSES,
    CATEGORIES as ALERT_CATEGORIES,
    SEVERITIES,
    ClinicalAlert,
)
from portal.models.consultation import Consultation
from portal.models.department import Department
from portal.models.emergency_case import EmergencyCase
from portal.models.medication_order import (
    ADMIN_STATUSES,
    ROUTES,
    MedicationAdministration,
    MedicationOrder,
)
from portal.models.nurse import Nurse
from portal.models.nurse import SHIFTS as NURSE_SHIFTS
from portal.models.nursing_assignment import (
    ASSIGNMENT_STATUSES,
    CARE_TYPES,
    NursingAssignment,
)
from portal.models.nursing_note import NOTE_TYPES, SHIFTS, NursingNote
from portal.models.patient import (
    MAX_OBSERVATION_DAYS as PATIENT_MAX_OBSERVATION_DAYS,
    Patient,
)
from portal.models.patient_observation import PatientObservation
from portal.models.role import Role
from portal.models.user import User
from portal.websocket.nursing_socket import emit_care_message

nursing_bp = Blueprint("nursing", __name__)

# How long the doctor is asked to plan for when they don't set an end date.
# Only a starting suggestion -- the field is editable, and passing the date
# does not end anything. Care runs until a nurse or the treating doctor
# closes it explicitly. The default comes from the patient's own surgical
# pathway (models/patient.DEFAULT_OBSERVATION_DAYS), so the number a doctor
# sets when marking the surgery is the number used here.
MAX_OBSERVATION_DAYS = PATIENT_MAX_OBSERVATION_DAYS

MAX_TEXT = 5000
TIMELINE_LIMIT = 300


# --------------------------------------------------------------------------
# parsing helpers
# --------------------------------------------------------------------------


def _parse_dt(raw, field):
    """Parses an ISO timestamp into the naive-UTC form the rest of the schema
    uses. Returns (datetime, error_message); both None means it was absent."""
    if raw in (None, ""):
        return None, None
    if not isinstance(raw, str):
        return None, f"{field} must be an ISO timestamp"
    try:
        # The browser sends "…Z", which older Pythons won't parse; normalising
        # it first keeps this working regardless of interpreter version.
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None, f"{field} must be an ISO timestamp"
    # Everything downstream stores naive UTC, so an offset-aware value is
    # converted rather than stored as-is with its offset silently dropped.
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed, None


def _text(payload, field, limit=MAX_TEXT):
    value = payload.get(field)
    if value is None:
        return None
    value = str(value).strip()
    return value[:limit] or None


def _int(payload, field, low=None, high=None):
    """Returns (value, error). Missing/blank reads as None, not zero."""
    raw = payload.get(field)
    if raw in (None, ""):
        return None, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, f"{field} must be a whole number"
    if low is not None and value < low:
        return None, f"{field} must be at least {low}"
    if high is not None and value > high:
        return None, f"{field} must be at most {high}"
    return value, None


def _float(payload, field, low=None, high=None):
    raw = payload.get(field)
    if raw in (None, ""):
        return None, None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None, f"{field} must be a number"
    if low is not None and value < low:
        return None, f"{field} must be at least {low}"
    if high is not None and value > high:
        return None, f"{field} must be at most {high}"
    return value, None


def _is_admin():
    return get_jwt().get("role") == "admin"


def _load_assignment(assignment_id):
    """Returns (assignment, error_response). 404s rather than 403s on someone
    else's assignment, for the same reason patient lookups do."""
    assignment = NursingAssignment.query.get(assignment_id)
    if not assignment or not can_view_assignment(assignment):
        return None, error("Assignment not found", status=404)
    return assignment, None


# --------------------------------------------------------------------------
# nurses directory
# --------------------------------------------------------------------------


@nursing_bp.get("/nurses")
@role_required("admin", "doctor")
def list_nurses():
    """The picker a doctor chooses from when handing a patient over.

    Joined through to the role and filtered to `nurse`, and to active accounts.
    A `Nurse` row already implies a nurse, so this is belt-and-braces -- but it
    means a profile created against the wrong user (a bad import, a manual DB
    edit, a future admin screen with a loose form) can never put a doctor or a
    receptionist in front of someone assigning patient care. A deactivated
    account is excluded for the same reason: it cannot take a handover.
    """
    query = (
        Nurse.query.join(Nurse.user)
        .join(Role, User.role_id == Role.id)
        .filter(Role.name == "nurse", User.is_active.is_(True))
        .order_by(User.name)
    )

    department_id = request.args.get("department_id", type=int)
    if department_id:
        query = query.filter(Nurse.department_id == department_id)

    nurses = query.all()

    # How much each nurse is already carrying, so the doctor isn't picking
    # blind — the whole point of a picker is to spread the load.
    load = dict(
        db.session.query(NursingAssignment.nurse_id, db.func.count(NursingAssignment.id))
        .filter(NursingAssignment.status == "active")
        .group_by(NursingAssignment.nurse_id)
        .all()
    )

    return success(
        [{**n.to_dict(), "active_assignments": load.get(n.id, 0)} for n in nurses]
    )


@nursing_bp.post("/nurses")
@role_required("admin")
def create_nurse():
    """Creates a nurse login plus their ward profile, same shape as
    `POST /doctors` — staff accounts stay an admin action."""
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    email, email_error = normalize_email(payload.get("email"))
    password = payload.get("password") or ""
    department_id = payload.get("department_id")

    if email_error:
        return error(email_error, status=422)
    if not name or not email or not password:
        return error("name, email and password are required", status=422)
    if len(password) < 6:
        return error("Password must be at least 6 characters", status=422)
    if User.query.filter_by(email=email).first():
        return error("A user with this email already exists", status=409)
    if department_id and not Department.query.get(department_id):
        return error("Department not found", status=404)

    shift = payload.get("shift") or None
    if shift and shift not in NURSE_SHIFTS:
        return error(f"shift must be one of: {', '.join(NURSE_SHIFTS)}", status=422)

    nurse_role = Role.query.filter_by(name="nurse").first()
    if not nurse_role:
        return error("The nurse role is missing — run the seeder first", status=500)

    # Same note as POST /doctors: this older route still takes a password, but
    # the account it creates gets a username like every other one.
    user = User(
        name=name, email=email, username=unique_username(name, email), role_id=nurse_role.id
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()  # assigns user.id before the Nurse row references it

    nurse = Nurse(
        user_id=user.id,
        department_id=department_id or None,
        employee_no=(payload.get("employee_no") or "").strip()[:50] or None,
        shift=shift,
    )
    db.session.add(nurse)
    db.session.commit()

    return success(nurse.to_dict(), message="Nurse created", status=201)


# --------------------------------------------------------------------------
# assignments
# --------------------------------------------------------------------------


@nursing_bp.get("/assignments")
@clinical_only
def list_assignments():
    """The nurse's ward list, and the doctor's monitor, from one query — the
    scope is what differs, not the shape."""
    query = scope_assignments(NursingAssignment.query)

    status = request.args.get("status", "active")
    if status != "all":
        if status not in ASSIGNMENT_STATUSES:
            allowed = ", ".join(ASSIGNMENT_STATUSES)
            return error(f"status must be one of: {allowed}, all", status=422)
        query = query.filter(NursingAssignment.status == status)

    patient_id = request.args.get("patient_id", type=int)
    if patient_id:
        query = query.filter(NursingAssignment.patient_id == patient_id)

    assignments = query.order_by(
        # Active first, then the ones running out soonest — that ordering is
        # the work list, not just a sort. Open-ended assignments sort last via
        # the IS NULL expression, because MySQL has no NULLS LAST.
        db.case((NursingAssignment.status == "active", 0), else_=1),
        NursingAssignment.ends_at.is_(None),
        NursingAssignment.ends_at.asc(),
        NursingAssignment.created_at.desc(),
    ).all()

    # A patient whose observation window ran out while nobody was looking
    # shows as ready for discharge the moment somebody is.
    refresh_for_assignments(assignments)

    viewer_id = get_jwt_identity()
    # Only the treating doctor has a review marker, so only they get the count.
    doctor = get_current_doctor()
    return success(
        [
            a.to_dict(
                viewer_id=viewer_id,
                for_doctor=bool(doctor and doctor.id == a.doctor_id),
            )
            for a in assignments
        ]
    )


@nursing_bp.post("/assignments")
@role_required("doctor")
def create_assignment():
    """Hands a patient to a nurse for the observation/recovery period."""
    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can assign a nurse", status=403)

    payload = request.get_json(silent=True) or {}

    patient = Patient.query.get(payload.get("patient_id"))
    if not patient:
        return error("Patient not found", status=404)
    if not can_access_patient(patient, doctor):
        return error("This patient is assigned to another doctor", status=403)

    # Nursing care is normally the post-operative watch, so it is offered for
    # surgery cases only. Enforced here and not just hidden in the UI: the
    # rule is the point, and a hidden button is not a rule. The one other
    # door in is an open Emergency Case — ICU/observation care that never
    # goes anywhere near the surgical pathway still needs a nurse assigned
    # immediately, not after someone marks a surgery that isn't happening.
    #
    # Kept as the case itself, not a boolean: it is also what the assignment
    # records as its origin, so the nurse's record can say this patient came
    # in through the emergency door and show the orders as emergency orders.
    open_emergency = (
        EmergencyCase.query.filter_by(patient_id=patient.id, status="in_progress")
        .order_by(EmergencyCase.arrived_at.desc())
        .first()
    )
    if not patient.is_surgical and not open_emergency:
        return error(
            f"A nurse is assigned for surgery cases only. Mark {patient.name}'s case "
            "as requiring surgery first.",
            status=409,
        )

    nurse = Nurse.query.get(payload.get("nurse_id"))
    if not nurse:
        return error("Nurse not found", status=404)

    care_type = payload.get("care_type") or "observation"
    if care_type not in CARE_TYPES:
        return error(f"care_type must be one of: {', '.join(CARE_TYPES)}", status=422)

    consultation = None
    if payload.get("consultation_id"):
        consultation = Consultation.query.get(payload["consultation_id"])
        if not consultation:
            return error("Consultation not found", status=404)
        if consultation.patient_id != patient.id:
            return error("That consultation belongs to a different patient", status=422)
        if consultation.doctor_id != doctor.id:
            return error("That consultation belongs to another doctor", status=403)

    # One active assignment per patient: two nurses both believing they own
    # the medication log is exactly the failure this module exists to prevent.
    clash = NursingAssignment.query.filter_by(
        patient_id=patient.id, status="active"
    ).first()
    if clash:
        return error(
            f"{patient.name} is already under nursing care "
            f"({clash.nurse.user.name if clash.nurse and clash.nurse.user else 'another nurse'}). "
            "Close that assignment first.",
            status=409,
        )

    ends_at, dt_error = _parse_dt(payload.get("ends_at"), "ends_at")
    if dt_error:
        return error(dt_error, status=422)

    starts_at = datetime.utcnow()
    days, days_error = _int(payload, "observation_days", low=1, high=MAX_OBSERVATION_DAYS)
    if days_error:
        return error(days_error, status=422)
    # Kept on the patient too, so marking the surgery completed later re-dates
    # the watch from the operation using the same number the doctor chose here
    # rather than falling back to the default.
    if days:
        patient.observation_days = days

    if ends_at is None:
        ends_at = starts_at + timedelta(days=days or patient.observation_days_planned)
    elif ends_at <= starts_at:
        return error("The observation period must end in the future", status=422)

    assignment = NursingAssignment(
        patient_id=patient.id,
        nurse_id=nurse.id,
        doctor_id=doctor.id,
        consultation_id=consultation.id if consultation else None,
        # A surgical patient who also has an emergency case open arrived
        # through the emergency door for this episode, so the link is
        # recorded either way — it is where the patient came from, not an
        # alternative to the surgical pathway.
        emergency_case_id=open_emergency.id if open_emergency else None,
        care_type=care_type,
        treatment_plan=_text(payload, "treatment_plan"),
        care_instructions=_text(payload, "care_instructions"),
        starts_at=starts_at,
        ends_at=ends_at,
        status="active",
    )
    db.session.add(assignment)
    db.session.flush()  # assigns assignment.id before the orders reference it

    # Carrying the prescription over is the normal case: the nurse should be
    # working from what the doctor actually prescribed, not a re-typed copy.
    if consultation and payload.get("import_prescription", True):
        _import_prescription_orders(assignment, consultation)

    added, order_error = _add_orders_from_payload(assignment, payload.get("medications"))
    if order_error:
        db.session.rollback()
        return error(order_error, status=422)

    notify(
        [nurse.user_id],
        # An emergency admission says so in the title: it is the one thing the
        # nurse needs before they open anything, and a bell that reads like
        # every other hand-off buries it.
        title=(
            f"Emergency patient assigned to you ({open_emergency.severity})"
            if open_emergency
            else "New patient assigned to you"
        ),
        body=(
            f"{doctor.user.name} assigned {patient.name} to you for "
            f"{care_type.replace('_', ' ')} care."
            if doctor.user
            else f"{patient.name} has been assigned to you."
        )
        + (f" Emergency {open_emergency.code}: {open_emergency.reason}" if open_emergency else ""),
        category="nursing",
        link=f"/nurse/patients/{assignment.id}",
        exclude_user_id=get_jwt_identity(),
    )

    audit(
        NURSING_ASSIGNED,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail=f"{patient.name} assigned to {nurse.user.name if nurse.user else 'nurse'} for {care_type.replace('_', ' ')} care",
    )
    db.session.commit()
    nursing_changed("assignment_created", assignment.id)
    dashboard_changed("nursing_assignment_created")

    return success(
        assignment.to_dict(include_detail=True),
        message=f"{patient.name} assigned to {nurse.user.name if nurse.user else 'nurse'}",
        status=201,
    )


def _import_prescription_orders(assignment, consultation):
    """Copies the consultation's prescription into the nurse's medication
    schedule. Route is guessed from the wording and stays editable — a nurse
    should never be blocked because a label said 'syrup'."""
    for item in consultation.prescriptions:
        db.session.add(
            MedicationOrder(
                assignment_id=assignment.id,
                medicine_id=item.medicine_id,
                medicine_name=item.medicine_name,
                route=_guess_route(item.medicine_name),
                dose=item.dose,
                frequency=item.frequency,
                duration=item.duration,
            )
        )


ROUTE_HINTS = (
    ("iv", ("iv", "saline", "drip", "infusion", "ringer", "dextrose")),
    ("injection", ("inject", "im ", "sc ", "vial", "ampoule")),
    ("inhalation", ("inhal", "nebul", "puff")),
    ("topical", ("ointment", "cream", "gel", "topical", "patch")),
)


def _guess_route(name):
    lowered = (name or "").lower()
    for route, hints in ROUTE_HINTS:
        if any(hint in lowered for hint in hints):
            return route
    return "oral"


def _add_orders_from_payload(assignment, items):
    """Returns (count_added, error_message)."""
    if not items:
        return 0, None
    if not isinstance(items, list):
        return 0, "medications must be a list"

    # Resolved against the same inventory the doctor prescribed from, so a
    # medication order carried over from a prescription is recognised rather
    # than flagged off-formulary. Out-of-stock included: the order records
    # what the doctor asked for, and sourcing it is the pharmacy's problem.
    prescribable = prescribable_for(assignment.doctor, include_out_of_stock=True)
    added = 0
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            return 0, f"Medication {index + 1} is not valid"
        name = (item.get("medicine_name") or "").strip()
        if not name:
            return 0, f"Medication {index + 1} needs a name"
        route = item.get("route") or _guess_route(name)
        if route not in ROUTES:
            return 0, f"Medication {index + 1}: route must be one of {', '.join(ROUTES)}"

        times_per_day = item.get("times_per_day")
        if times_per_day in (None, ""):
            times_per_day = None
        else:
            try:
                times_per_day = int(times_per_day)
            except (TypeError, ValueError):
                return 0, f"Medication {index + 1}: times_per_day must be a whole number"
            if not 1 <= times_per_day <= 24:
                return 0, f"Medication {index + 1}: times_per_day must be between 1 and 24"

        _brand, medicine_id = resolve_medicine(name, prescribable)
        db.session.add(
            MedicationOrder(
                assignment_id=assignment.id,
                medicine_id=medicine_id,
                medicine_name=name[:150],
                route=route,
                dose=(item.get("dose") or "").strip()[:255] or None,
                frequency=(item.get("frequency") or "").strip()[:255] or None,
                duration=(item.get("duration") or "").strip()[:255] or None,
                instructions=(item.get("instructions") or "").strip()[:MAX_TEXT] or None,
                times_per_day=times_per_day,
            )
        )
        added += 1
    return added, None


@nursing_bp.get("/assignments/<int:assignment_id>")
@clinical_only
def get_assignment(assignment_id):
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure

    refresh_for_assignments([assignment])

    data = assignment.to_dict(
        include_detail=True,
        viewer_id=get_jwt_identity(),
        for_doctor=_is_treating_doctor(assignment),
    )
    # Lets the UI hide controls that would 403 anyway — the real check is on
    # each write route, not here.
    data["can_record"] = can_record_on(assignment)
    # Admins read the thread for oversight but cannot post into it.
    data["can_message"] = not _is_admin() and (
        data["can_record"] or bool(get_current_doctor() and get_current_doctor().id == assignment.doctor_id)
    )
    data["can_manage_plan"] = _can_manage_plan(assignment)
    data["today"] = _todays_medication_progress(assignment)
    return success(data)


def _can_manage_plan(assignment):
    doctor = get_current_doctor()
    return bool(doctor and doctor.id == assignment.doctor_id)


def _todays_medication_progress(assignment):
    """Doses expected vs. logged since midnight UTC, per order.

    Expectation comes from `times_per_day`; an as-needed order has no target
    and is never reported as behind.
    """
    since = datetime.combine(datetime.utcnow().date(), datetime.min.time())
    logged = {}
    for record in assignment.administrations:
        stamp = record.administered_at or record.created_at
        if stamp and stamp >= since and record.order_id:
            logged[record.order_id] = logged.get(record.order_id, 0) + 1

    rows = []
    expected_total = 0
    logged_total = 0
    for order in assignment.medication_orders:
        if not order.is_active:
            continue
        count = logged.get(order.id, 0)
        rows.append(
            {
                "order_id": order.id,
                "medicine_name": order.medicine_name,
                "expected": order.times_per_day,
                "logged": count,
                "remaining": (
                    max(0, order.times_per_day - count) if order.times_per_day else None
                ),
            }
        )
        logged_total += count
        if order.times_per_day:
            expected_total += order.times_per_day

    return {
        "date": datetime.utcnow().date().isoformat(),
        "expected": expected_total,
        "logged": logged_total,
        "orders": rows,
    }


@nursing_bp.patch("/assignments/<int:assignment_id>")
@role_required("doctor")
def update_assignment(assignment_id):
    """The doctor's half: revise the plan, extend the watch, or close it."""
    assignment = NursingAssignment.query.get(assignment_id)
    if not assignment:
        return error("Assignment not found", status=404)
    if not _can_manage_plan(assignment):
        return error("This assignment belongs to another doctor", status=403)

    payload = request.get_json(silent=True) or {}

    if "care_instructions" in payload:
        assignment.care_instructions = _text(payload, "care_instructions")
    if "treatment_plan" in payload:
        assignment.treatment_plan = _text(payload, "treatment_plan")

    if "care_type" in payload:
        care_type = payload.get("care_type")
        if care_type not in CARE_TYPES:
            return error(f"care_type must be one of: {', '.join(CARE_TYPES)}", status=422)
        assignment.care_type = care_type

    if "nurse_id" in payload:
        nurse = Nurse.query.get(payload.get("nurse_id"))
        if not nurse:
            return error("Nurse not found", status=404)
        if nurse.id != assignment.nurse_id:
            previous_nurse_id = assignment.nurse.user_id if assignment.nurse else None
            assignment.nurse_id = nurse.id
            # Both nurses need to know: one has picked the patient up, the
            # other must stop expecting to round on them.
            notify(
                [uid for uid in (nurse.user_id, previous_nurse_id) if uid],
                title="Nursing assignment reassigned",
                body=f"{assignment.patient.name if assignment.patient else 'A patient'} is now under {nurse.user.name if nurse.user else 'another nurse'}.",
                category="nursing",
                link=f"/nurse/patients/{assignment.id}",
                exclude_user_id=get_jwt_identity(),
            )

    if "ends_at" in payload:
        ends_at, dt_error = _parse_dt(payload.get("ends_at"), "ends_at")
        if dt_error:
            return error(dt_error, status=422)
        assignment.ends_at = ends_at

    if "status" in payload:
        status = payload.get("status")
        if status not in ASSIGNMENT_STATUSES:
            allowed = ", ".join(ASSIGNMENT_STATUSES)
            return error(f"status must be one of: {allowed}", status=422)
        assignment.status = status
        assignment.completed_at = (
            datetime.utcnow() if status in ("completed", "cancelled") else None
        )
        if status != "active" and assignment.nurse:
            notify(
                [assignment.nurse.user_id],
                title=f"Nursing care {status}",
                body=f"{assignment.patient.name if assignment.patient else 'A patient'} is no longer under your care.",
                category="nursing",
                link=f"/nurse/patients/{assignment.id}",
                exclude_user_id=get_jwt_identity(),
            )

    audit(
        NURSING_CLOSED if assignment.status != "active" else NURSING_UPDATED,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail=f"Care plan {assignment.status} for {assignment.patient.name if assignment.patient else 'patient'}",
    )
    db.session.commit()
    nursing_changed("assignment_updated", assignment.id)

    data = assignment.to_dict(include_detail=True, viewer_id=get_jwt_identity())
    data["can_record"] = can_record_on(assignment)
    data["can_manage_plan"] = True
    data["can_message"] = True
    data["today"] = _todays_medication_progress(assignment)
    return success(data, message="Assignment updated")


@nursing_bp.post("/assignments/<int:assignment_id>/discharge")
@clinical_only
def discharge_assignment(assignment_id):
    """Ends nursing care for a patient.

    Open to both halves of the pair, because either can be the one who knows
    it is finished: the nurse is with the patient, the doctor signs off the
    recovery. Nothing else ends an assignment -- an observation window passing
    does not, which is the whole point of it being an expectation rather than
    a deadline.

    `cancelled` stays doctor-only. Completing says care finished; cancelling
    says the hand-off should not have happened, and undoing the doctor's
    decision is the doctor's call.
    """
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure

    nurse = get_current_nurse()
    is_assigned_nurse = bool(nurse and nurse.id == assignment.nurse_id)
    is_doctor = _is_treating_doctor(assignment)

    if not (is_assigned_nurse or is_doctor):
        return error("Only the assigned nurse or the treating doctor can close this", status=403)

    if assignment.status != "active":
        return error(f"This assignment is already {assignment.status}", status=409)

    payload = request.get_json(silent=True) or {}
    status = payload.get("status") or "completed"
    if status not in ("completed", "cancelled"):
        return error("status must be 'completed' or 'cancelled'", status=422)
    if status == "cancelled" and not is_doctor:
        return error("Only the treating doctor can cancel an assignment", status=403)

    summary = _text(payload, "summary")

    assignment.status = status
    assignment.completed_at = datetime.utcnow()

    # Closing the watch is the discharge: the surgical pathway exists to put a
    # nurse on this patient, so it ends with them. Cancelling is different —
    # it says the hand-off should not have happened, and the patient may still
    # be waiting for their operation, so the pathway stays as it was.
    if status == "completed" and assignment.patient:
        assignment.patient.clear_surgery()

    # A closing note keeps the reason on the record rather than only in an
    # audit row, so the next person reading the timeline sees why it ended.
    if summary and nurse:
        db.session.add(
            NursingNote(
                assignment_id=assignment.id,
                nurse_id=nurse.id,
                note_type="note",
                content=f"Care {status}: {summary}",
            )
        )

    patient_name = assignment.patient.name if assignment.patient else "the patient"
    actor = "nurse" if is_assigned_nurse else "doctor"

    # Tell the other side. notify() drops whoever performed the action.
    recipients = []
    if assignment.doctor:
        recipients.append(assignment.doctor.user_id)
    if assignment.nurse:
        recipients.append(assignment.nurse.user_id)
    notify(
        recipients,
        title=f"Nursing care {status}",
        body=f"{patient_name} was marked {status} by the {actor}."
        + (f" {summary}" if summary else ""),
        category="nursing",
        link=(
            f"/dashboard/nursing/{assignment.id}"
            if is_assigned_nurse
            else f"/nurse/patients/{assignment.id}"
        ),
        exclude_user_id=get_jwt_identity(),
    )
    audit(
        NURSING_CLOSED,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail=f"{patient_name} marked {status} by the {actor}",
    )

    db.session.commit()
    nursing_changed("assignment_closed", assignment.id)
    dashboard_changed("nursing_assignment_closed")

    return success(
        assignment.to_dict(viewer_id=get_jwt_identity(), for_doctor=is_doctor),
        message=f"Nursing care {status}",
    )


# --------------------------------------------------------------------------
# medication orders (doctor-owned)
# --------------------------------------------------------------------------


@nursing_bp.post("/assignments/<int:assignment_id>/medications")
@role_required("doctor")
def add_medication_order(assignment_id):
    assignment = NursingAssignment.query.get(assignment_id)
    if not assignment:
        return error("Assignment not found", status=404)
    if not _can_manage_plan(assignment):
        return error("This assignment belongs to another doctor", status=403)

    payload = request.get_json(silent=True) or {}
    added, order_error = _add_orders_from_payload(assignment, [payload])
    if order_error:
        db.session.rollback()
        return error(order_error, status=422)

    if assignment.nurse:
        notify(
            [assignment.nurse.user_id],
            title="Medication order updated",
            body=f"A new medication was added for {assignment.patient.name if assignment.patient else 'your patient'}.",
            category="nursing",
            link=f"/nurse/patients/{assignment.id}",
            exclude_user_id=get_jwt_identity(),
        )

    audit(
        MEDICATION_ORDERED,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail=f"Ordered {payload.get('medicine_name')} for {assignment.patient.name if assignment.patient else 'patient'}",
    )
    db.session.commit()
    nursing_changed("medication_order_added", assignment.id)

    return success(
        [o.to_dict() for o in assignment.medication_orders],
        message="Medication added",
        status=201,
    )


@nursing_bp.patch("/medications/<int:order_id>")
@role_required("doctor")
def update_medication_order(order_id):
    """Edit or stop an order. Stopping sets is_active=False rather than
    deleting, so the doses already logged against it keep their context."""
    order = MedicationOrder.query.get(order_id)
    if not order:
        return error("Medication not found", status=404)
    if not _can_manage_plan(order.assignment):
        return error("This assignment belongs to another doctor", status=403)

    payload = request.get_json(silent=True) or {}

    if "route" in payload:
        if payload.get("route") not in ROUTES:
            return error(f"route must be one of: {', '.join(ROUTES)}", status=422)
        order.route = payload["route"]
    for field in ("dose", "frequency", "duration"):
        if field in payload:
            setattr(order, field, (payload.get(field) or "").strip()[:255] or None)
    if "instructions" in payload:
        order.instructions = _text(payload, "instructions")
    if "times_per_day" in payload:
        times, times_error = _int(payload, "times_per_day", low=1, high=24)
        if times_error:
            return error(times_error, status=422)
        order.times_per_day = times
    if "is_active" in payload:
        order.is_active = bool(payload.get("is_active"))

    db.session.commit()
    nursing_changed("medication_order_updated", order.assignment_id)
    return success(order.to_dict(), message="Medication updated")


# --------------------------------------------------------------------------
# the nursing record (nurse-owned)
# --------------------------------------------------------------------------


def _require_recording_nurse(assignment):
    """Returns (nurse, error_response) for a route that writes to the record."""
    nurse = get_current_nurse()
    if not nurse:
        return None, error("Only a nurse can update the nursing record", status=403)
    if assignment.nurse_id != nurse.id:
        return None, error("This patient is assigned to another nurse", status=403)
    if assignment.status != "active":
        return None, error("This assignment is closed", status=409)
    return nurse, None


@nursing_bp.post("/assignments/<int:assignment_id>/administrations")
@clinical_only
def record_administration(assignment_id):
    """Logs one dose: what was given (or not), when, and why."""
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure
    nurse, failure = _require_recording_nurse(assignment)
    if failure:
        return failure

    payload = request.get_json(silent=True) or {}

    status = payload.get("status")
    if status not in ADMIN_STATUSES:
        return error(f"status must be one of: {', '.join(ADMIN_STATUSES)}", status=422)

    order = None
    if payload.get("order_id"):
        order = MedicationOrder.query.get(payload["order_id"])
        if not order or order.assignment_id != assignment.id:
            return error("Medication not found on this assignment", status=404)

    medicine_name = (payload.get("medicine_name") or "").strip()
    if order and not medicine_name:
        medicine_name = order.medicine_name
    if not medicine_name:
        return error("medicine_name is required for an unscheduled dose", status=422)

    route = payload.get("route") or (order.route if order else "oral")
    if route not in ROUTES:
        return error(f"route must be one of: {', '.join(ROUTES)}", status=422)

    scheduled_at, dt_error = _parse_dt(payload.get("scheduled_at"), "scheduled_at")
    if dt_error:
        return error(dt_error, status=422)
    administered_at, dt_error = _parse_dt(payload.get("administered_at"), "administered_at")
    if dt_error:
        return error(dt_error, status=422)

    # A dose that was given needs a time; one that wasn't must not carry one,
    # or the log would claim it happened.
    if status in ("completed", "delayed"):
        administered_at = administered_at or datetime.utcnow()
    else:
        administered_at = None

    record = MedicationAdministration(
        assignment_id=assignment.id,
        order_id=order.id if order else None,
        nurse_id=nurse.id,
        medicine_name=medicine_name[:150],
        route=route,
        dose=(payload.get("dose") or (order.dose if order else "") or "").strip()[:255] or None,
        scheduled_at=scheduled_at,
        administered_at=administered_at,
        status=status,
        notes=_text(payload, "notes"),
    )
    db.session.add(record)
    db.session.flush()

    # A missed dose is exactly the thing the doctor asked to be flagged on, so
    # it raises an alert on its own rather than waiting for the nurse to
    # remember to escalate it.
    alert = None
    if status == "missed":
        alert = _raise_alert(
            assignment,
            nurse,
            category="missed_medication",
            severity="warning",
            message=(
                f"{medicine_name} was not given"
                + (f" — {record.notes}" if record.notes else ".")
            ),
        )
    else:
        _notify_doctor(
            assignment,
            title="Medication logged",
            body=f"{medicine_name} marked {status} for {assignment.patient.name if assignment.patient else 'your patient'}.",
        )

    audit(
        MEDICATION_ADMINISTERED,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail=f"{medicine_name} marked {status}",
    )
    db.session.commit()
    nursing_changed("medication_administered", assignment.id)

    return success(
        {
            "administration": record.to_dict(),
            "alert": alert.to_dict() if alert else None,
            "compliance": assignment.compliance(),
            "today": _todays_medication_progress(assignment),
        },
        message="Medication logged",
        status=201,
    )


@nursing_bp.post("/assignments/<int:assignment_id>/observations")
@clinical_only
def record_observation(assignment_id):
    """Records a round: vitals, symptoms, recovery, complications."""
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure
    nurse, failure = _require_recording_nurse(assignment)
    if failure:
        return failure

    payload = request.get_json(silent=True) or {}

    recorded_at, dt_error = _parse_dt(payload.get("recorded_at"), "recorded_at")
    if dt_error:
        return error(dt_error, status=422)

    # Bounds are physiological sanity checks, not clinical ranges — they catch
    # a slipped decimal point. What counts as abnormal is decided by the model.
    numeric_fields = (
        ("temperature_c", _float, 25.0, 45.0),
        ("blood_sugar", _float, 10.0, 900.0),
        ("pulse_bpm", _int, 20, 260),
        ("systolic_bp", _int, 40, 300),
        ("diastolic_bp", _int, 20, 200),
        ("respiratory_rate", _int, 4, 80),
        ("spo2", _int, 40, 100),
        ("pain_score", _int, 0, 10),
    )
    values = {}
    for field, parser, low, high in numeric_fields:
        value, parse_error = parser(payload, field, low, high)
        if parse_error:
            return error(parse_error, status=422)
        values[field] = value

    observation = PatientObservation(
        assignment_id=assignment.id,
        nurse_id=nurse.id,
        recorded_at=recorded_at or datetime.utcnow(),
        symptoms=_text(payload, "symptoms"),
        recovery_progress=_text(payload, "recovery_progress"),
        complications=_text(payload, "complications"),
        **values,
    )
    observation.evaluate()

    # `is None`, not falsiness: a pain score of 0 and an SpO₂ of 0 are both
    # real readings that must not read as "nothing was entered".
    has_vitals = any(value is not None for value in values.values())
    has_text = any(
        (observation.symptoms, observation.recovery_progress, observation.complications)
    )
    if not has_vitals and not has_text:
        return error("Record at least one vital sign or note", status=422)

    db.session.add(observation)
    db.session.flush()

    alert = None
    if observation.is_abnormal:
        flagged = observation.abnormal_vitals()
        detail = ", ".join(flagged) if flagged else "complications reported"
        alert = _raise_alert(
            assignment,
            nurse,
            category="abnormal_observation",
            severity="critical" if observation.complications else "warning",
            message=(
                f"Abnormal observation: {detail}."
                + (f" {observation.complications}" if observation.complications else "")
            ),
        )
    else:
        _notify_doctor(
            assignment,
            title="Observation recorded",
            body=f"New vitals logged for {assignment.patient.name if assignment.patient else 'your patient'}.",
        )

    audit(
        OBSERVATION_RECORDED,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail="Abnormal observation recorded" if observation.is_abnormal else "Observation recorded",
    )
    db.session.commit()
    nursing_changed("observation_recorded", assignment.id)

    return success(
        {"observation": observation.to_dict(), "alert": alert.to_dict() if alert else None},
        message="Observation recorded",
        status=201,
    )


@nursing_bp.post("/assignments/<int:assignment_id>/notes")
@clinical_only
def add_note(assignment_id):
    """A nursing note, or an end-of-shift handover to the next nurse."""
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure
    nurse, failure = _require_recording_nurse(assignment)
    if failure:
        return failure

    payload = request.get_json(silent=True) or {}

    content = _text(payload, "content")
    if not content:
        return error("A note cannot be empty", status=422)

    note_type = payload.get("note_type") or "note"
    if note_type not in NOTE_TYPES:
        return error(f"note_type must be one of: {', '.join(NOTE_TYPES)}", status=422)

    shift = payload.get("shift") or None
    if shift and shift not in SHIFTS:
        return error(f"shift must be one of: {', '.join(SHIFTS)}", status=422)

    handover_to = None
    if payload.get("handover_to_nurse_id"):
        handover_to = Nurse.query.get(payload["handover_to_nurse_id"])
        if not handover_to:
            return error("Nurse not found", status=404)
        if handover_to.id == nurse.id:
            return error("Hand over to a different nurse", status=422)

    note = NursingNote(
        assignment_id=assignment.id,
        nurse_id=nurse.id,
        note_type=note_type,
        shift=shift,
        content=content,
        handover_to_nurse_id=handover_to.id if handover_to else None,
    )
    db.session.add(note)

    if handover_to:
        # The incoming nurse takes over the assignment as well as the note —
        # otherwise they'd be told to read a handover for a patient that never
        # appears on their list.
        assignment.nurse_id = handover_to.id
        notify(
            [handover_to.user_id],
            title="Shift handover received",
            body=f"{nurse.user.name if nurse.user else 'A nurse'} handed over {assignment.patient.name if assignment.patient else 'a patient'} to you.",
            category="nursing",
            link=f"/nurse/patients/{assignment.id}",
            exclude_user_id=get_jwt_identity(),
        )

    _notify_doctor(
        assignment,
        title="Nursing note added" if note_type == "note" else "Shift handover logged",
        body=f"{nurse.user.name if nurse.user else 'A nurse'} updated the record for {assignment.patient.name if assignment.patient else 'your patient'}.",
    )

    audit(
        HANDOVER if note_type == "handover" else NOTE_ADDED,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail=(
            f"Shift handed over to {handover_to.user.name if handover_to and handover_to.user else 'the next nurse'}"
            if note_type == "handover"
            else "Nursing note added"
        ),
    )
    db.session.commit()
    nursing_changed("note_added", assignment.id)

    return success(note.to_dict(), message="Note saved", status=201)


# --------------------------------------------------------------------------
# alerts
# --------------------------------------------------------------------------


def _raise_alert(assignment, nurse, category, severity, message):
    """Creates the alert and pings the doctor. Added to the caller's open
    session so it commits with the event that caused it."""
    alert = ClinicalAlert(
        assignment_id=assignment.id,
        nurse_id=nurse.id,
        doctor_id=assignment.doctor_id,
        category=category,
        severity=severity,
        message=message,
    )
    db.session.add(alert)

    patient_name = assignment.patient.name if assignment.patient else "A patient"
    _notify_doctor(
        assignment,
        title=f"{'🚨 ' if severity == 'critical' else ''}Nursing alert — {patient_name}",
        body=message[:255],
    )
    return alert


def _notify_doctor(assignment, title, body):
    if not assignment.doctor:
        return
    notify(
        [assignment.doctor.user_id],
        title=title,
        body=body[:255],
        category="nursing",
        link=f"/dashboard/nursing/{assignment.id}",
        exclude_user_id=get_jwt_identity(),
    )


@nursing_bp.post("/assignments/<int:assignment_id>/alerts")
@clinical_only
def create_alert(assignment_id):
    """The nurse flagging something to the doctor by hand."""
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure
    nurse, failure = _require_recording_nurse(assignment)
    if failure:
        return failure

    payload = request.get_json(silent=True) or {}

    category = payload.get("category") or "other"
    if category not in ALERT_CATEGORIES:
        return error(f"category must be one of: {', '.join(ALERT_CATEGORIES)}", status=422)

    severity = payload.get("severity") or "warning"
    if severity not in SEVERITIES:
        return error(f"severity must be one of: {', '.join(SEVERITIES)}", status=422)

    message = _text(payload, "message")
    if not message:
        return error("Describe what the doctor needs to know", status=422)

    alert = _raise_alert(assignment, nurse, category, severity, message)

    audit(
        ALERT_RAISED,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail=f"{severity} alert raised: {category.replace('_', ' ')}",
    )
    db.session.commit()
    nursing_changed("alert_raised", assignment.id)
    dashboard_changed("nursing_alert")

    return success(alert.to_dict(), message="Doctor notified", status=201)


@nursing_bp.get("/alerts")
@clinical_only
def list_alerts():
    """Open alerts across everything the caller can see."""
    query = ClinicalAlert.query.join(ClinicalAlert.assignment)
    query = scope_assignments(query)

    status = request.args.get("status", "open")
    if status != "all":
        if status not in ALERT_STATUSES:
            allowed = ", ".join(ALERT_STATUSES)
            return error(f"status must be one of: {allowed}, all", status=422)
        query = query.filter(ClinicalAlert.status == status)

    alerts = query.order_by(
        db.case((ClinicalAlert.severity == "critical", 0), else_=1),
        ClinicalAlert.created_at.desc(),
    ).limit(100).all()

    return success([a.to_dict(include_patient=True) for a in alerts])


@nursing_bp.post("/alerts/<int:alert_id>/acknowledge")
@role_required("doctor", "admin")
def acknowledge_alert(alert_id):
    """The doctor confirming they've seen it, with an optional instruction
    back to the nurse."""
    alert = ClinicalAlert.query.get(alert_id)
    if not alert:
        return error("Alert not found", status=404)

    doctor = get_current_doctor()
    if doctor and alert.doctor_id != doctor.id:
        return error("This alert belongs to another doctor", status=403)
    if not doctor and not _is_admin():
        return error("Forbidden", status=403)

    payload = request.get_json(silent=True) or {}
    status = payload.get("status") or "acknowledged"
    if status not in ("acknowledged", "resolved"):
        return error("status must be 'acknowledged' or 'resolved'", status=422)

    alert.status = status
    alert.acknowledged_at = datetime.utcnow()
    alert.acknowledged_by = int(get_jwt_identity())
    response = _text(payload, "doctor_response")
    if response:
        alert.doctor_response = response

    if alert.nurse:
        notify(
            [alert.nurse.user_id],
            title=f"Doctor {status} your alert",
            body=response[:255] if response else alert.message[:255],
            category="nursing",
            link=f"/nurse/patients/{alert.assignment_id}",
            exclude_user_id=get_jwt_identity(),
        )

    audit(
        ALERT_ANSWERED,
        entity="nursing_assignment",
        entity_id=alert.assignment_id,
        detail=f"Alert {status} by the doctor",
    )
    db.session.commit()
    nursing_changed("alert_acknowledged", alert.assignment_id)

    return success(alert.to_dict(include_patient=True), message=f"Alert {status}")


# --------------------------------------------------------------------------
# the doctor's view of what the nurse has been doing
# --------------------------------------------------------------------------

UPDATES_LIMIT = 200


def _is_treating_doctor(assignment):
    doctor = get_current_doctor()
    return bool(doctor and doctor.id == assignment.doctor_id)


@nursing_bp.post("/assignments/<int:assignment_id>/seen")
@clinical_only
def mark_assignment_seen(assignment_id):
    """Records that the treating doctor has reviewed this record.

    Clears the "new updates" badge. Deliberately explicit rather than a
    side effect of GET: a list view prefetching records would otherwise mark
    them reviewed without anyone reading a word.
    """
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure
    if not _is_treating_doctor(assignment):
        return error("Only the treating doctor reviews this record", status=403)

    assignment.doctor_seen_at = datetime.utcnow()
    db.session.commit()
    nursing_changed("assignment_reviewed", assignment.id)

    return success(
        {"doctor_seen_at": to_utc_iso(assignment.doctor_seen_at), "unreviewed_updates": 0},
        message="Marked reviewed",
    )


@nursing_bp.get("/updates")
@clinical_only
def nursing_updates():
    """Every nursing update across the caller's patients, newest first.

    The per-record timeline answers "what happened to this patient"; this
    answers "what has happened while I was away", which is the question a
    doctor actually opens the app with. Scoped the same way as everything
    else, so a doctor only ever sees their own patients' activity.
    """
    query = scope_assignments(NursingAssignment.query)

    if request.args.get("status", "active") != "all":
        query = query.filter(NursingAssignment.status == "active")

    unreviewed_only = request.args.get("unreviewed") == "true"

    feed = []
    for assignment in query.all():
        seen_at = assignment.doctor_seen_at
        for at, kind, summary in assignment.nursing_activity():
            # Same boundary rule as unreviewed_count -- see that docstring.
            is_new = seen_at is None or at > seen_at
            if unreviewed_only and not is_new:
                continue
            feed.append(
                {
                    "assignment_id": assignment.id,
                    "patient": assignment.patient.name if assignment.patient else None,
                    "patient_code": assignment.patient.code if assignment.patient else None,
                    "patient_photo_url": (
                        assignment.patient.photo_url if assignment.patient else None
                    ),
                    "nurse": (
                        assignment.nurse.user.name
                        if assignment.nurse and assignment.nurse.user
                        else None
                    ),
                    "kind": kind,
                    "summary": summary,
                    "at": to_utc_iso(at),
                    "is_new": is_new,
                }
            )

    feed.sort(key=lambda e: e["at"] or "", reverse=True)
    return success(feed[:UPDATES_LIMIT])


# --------------------------------------------------------------------------
# doctor <-> nurse messages
# --------------------------------------------------------------------------

MAX_MESSAGE_CHARS = 2000


def _messaging_identity(assignment):
    """Returns (sender_role, counterpart_user_ids, error_response).

    Only the two people responsible for this patient hold the conversation.
    An admin may read the thread for oversight but not post into it -- an
    instruction has to come from the doctor who is accountable for it.
    """
    nurse = get_current_nurse()
    if nurse and nurse.id == assignment.nurse_id:
        doctor_user_id = assignment.doctor.user_id if assignment.doctor else None
        return "nurse", [uid for uid in (doctor_user_id,) if uid], None

    doctor = get_current_doctor()
    if doctor and doctor.id == assignment.doctor_id:
        nurse_user_id = assignment.nurse.user_id if assignment.nurse else None
        return "doctor", [uid for uid in (nurse_user_id,) if uid], None

    if _is_admin():
        return None, [], error("Admins can read this thread but not post to it", status=403)

    return None, [], error("You are not part of this patient's care team", status=403)


@nursing_bp.get("/assignments/<int:assignment_id>/messages")
@clinical_only
def list_messages(assignment_id):
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure
    return success([m.to_dict() for m in assignment.messages])


@nursing_bp.post("/assignments/<int:assignment_id>/messages")
@clinical_only
def send_message(assignment_id):
    """Posts to the thread and pushes it to the other side immediately."""
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure

    sender_role, recipients, failure = _messaging_identity(assignment)
    if failure:
        return failure

    payload = request.get_json(silent=True) or {}
    body = _text(payload, "body", MAX_MESSAGE_CHARS)
    if not body:
        return error("Write something before sending", status=422)

    message = CareMessage(
        assignment_id=assignment.id,
        sender_id=int(get_jwt_identity()),
        sender_role=sender_role,
        body=body,
    )
    db.session.add(message)
    db.session.flush()  # populates created_at/id for the socket payload

    patient_name = assignment.patient.name if assignment.patient else "a patient"
    # The bell is the fallback for someone not currently on the record; the
    # socket push below is what makes it feel live for someone who is.
    notify(
        recipients,
        title=f"Message about {patient_name}",
        body=body[:255],
        category="nursing",
        link=(
            f"/nurse/patients/{assignment.id}"
            if sender_role == "doctor"
            else f"/dashboard/nursing/{assignment.id}"
        ),
        exclude_user_id=get_jwt_identity(),
    )
    audit(
        MESSAGE_SENT,
        entity="nursing_assignment",
        entity_id=assignment.id,
        detail=f"{sender_role} messaged about {patient_name}",
    )

    db.session.commit()

    data = message.to_dict()
    emit_care_message(assignment.id, data)
    nursing_changed("message_sent", assignment.id)

    return success(data, message="Message sent", status=201)


@nursing_bp.post("/assignments/<int:assignment_id>/messages/read")
@clinical_only
def mark_messages_read(assignment_id):
    """Marks the other side's messages as read. Only ever touches messages the
    caller did not write -- you cannot mark your own as read."""
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure

    user_id = int(get_jwt_identity())
    updated = (
        CareMessage.query.filter(
            CareMessage.assignment_id == assignment.id,
            CareMessage.sender_id != user_id,
            CareMessage.read_at.is_(None),
        ).update({"read_at": datetime.utcnow()}, synchronize_session=False)
    )
    db.session.commit()
    if updated:
        nursing_changed("messages_read", assignment.id)

    return success({"updated": updated}, message="Marked read")


# --------------------------------------------------------------------------
# timeline
# --------------------------------------------------------------------------

TIMELINE_STATUS_SEVERITY = {"missed": "critical", "skipped": "warning", "delayed": "warning"}


@nursing_bp.get("/assignments/<int:assignment_id>/timeline")
@clinical_only
def get_timeline(assignment_id):
    """Every nursing activity on this patient, newest first.

    Assembled from the four record tables rather than kept in a fifth: a
    separate timeline table would be a second copy of the truth, and the first
    time the two disagreed nobody would know which one to believe.
    """
    assignment, failure = _load_assignment(assignment_id)
    if failure:
        return failure

    events = [
        {
            "type": "assignment",
            "at": to_utc_iso(assignment.starts_at or assignment.created_at),
            "title": "Nursing care started",
            "detail": (
                f"{assignment.care_type.replace('_', ' ').capitalize()} care assigned by "
                f"{assignment.doctor.user.name if assignment.doctor and assignment.doctor.user else 'the doctor'}"
            ),
            "actor": assignment.nurse.user.name if assignment.nurse and assignment.nurse.user else None,
            "severity": "info",
        }
    ]

    for record in assignment.administrations:
        events.append(
            {
                "type": "medication",
                "at": to_utc_iso(record.administered_at or record.created_at),
                "title": f"{record.medicine_name} — {record.status}",
                "detail": " · ".join(
                    part for part in (record.dose, record.route_label, record.notes) if part
                ),
                "actor": record.nurse.user.name if record.nurse and record.nurse.user else None,
                "severity": TIMELINE_STATUS_SEVERITY.get(record.status, "success"),
                "ref_id": record.id,
            }
        )

    for observation in assignment.observations:
        vitals = _vitals_line(observation)
        events.append(
            {
                "type": "observation",
                "at": to_utc_iso(observation.recorded_at),
                "title": "Observation recorded",
                "detail": " · ".join(
                    part
                    for part in (vitals, observation.symptoms, observation.complications)
                    if part
                ),
                "actor": observation.nurse.user.name
                if observation.nurse and observation.nurse.user
                else None,
                "severity": "warning" if observation.is_abnormal else "info",
                "ref_id": observation.id,
            }
        )

    for note in assignment.notes:
        events.append(
            {
                "type": note.note_type,
                "at": to_utc_iso(note.created_at),
                "title": "Shift handover" if note.note_type == "handover" else "Nursing note",
                "detail": note.content,
                "actor": note.nurse.user.name if note.nurse and note.nurse.user else None,
                "severity": "info",
                "ref_id": note.id,
            }
        )

    for message in assignment.messages:
        events.append(
            {
                "type": "message",
                "at": to_utc_iso(message.created_at),
                "title": f"Message from the {message.sender_role}",
                "detail": message.body,
                "actor": message.sender.name if message.sender else None,
                "severity": "info",
                "ref_id": message.id,
            }
        )

    for alert in assignment.alerts:
        events.append(
            {
                "type": "alert",
                "at": to_utc_iso(alert.created_at),
                "title": f"Doctor flagged — {alert.category.replace('_', ' ')}",
                "detail": alert.message,
                "actor": alert.nurse.user.name if alert.nurse and alert.nurse.user else None,
                "severity": alert.severity,
                "ref_id": alert.id,
                "status": alert.status,
            }
        )
        if alert.acknowledged_at:
            events.append(
                {
                    "type": "acknowledgement",
                    "at": to_utc_iso(alert.acknowledged_at),
                    "title": f"Doctor {alert.status} the alert",
                    "detail": alert.doctor_response,
                    "actor": alert.acknowledger.name if alert.acknowledger else None,
                    "severity": "success",
                    "ref_id": alert.id,
                }
            )

    if assignment.completed_at:
        events.append(
            {
                "type": "assignment",
                "at": to_utc_iso(assignment.completed_at),
                "title": f"Nursing care {assignment.status}",
                "detail": None,
                "actor": None,
                "severity": "info",
            }
        )

    # Anything with no usable timestamp sorts last rather than blowing up the
    # comparison.
    events.sort(key=lambda e: e["at"] or "", reverse=True)
    return success(events[:TIMELINE_LIMIT])


def _vitals_line(observation):
    parts = []
    if observation.temperature_c is not None:
        parts.append(f"{float(observation.temperature_c)}°C")
    if observation.pulse_bpm is not None:
        parts.append(f"{observation.pulse_bpm} bpm")
    if observation.systolic_bp and observation.diastolic_bp:
        parts.append(f"{observation.systolic_bp}/{observation.diastolic_bp} mmHg")
    if observation.spo2 is not None:
        parts.append(f"SpO₂ {observation.spo2}%")
    if observation.respiratory_rate is not None:
        parts.append(f"RR {observation.respiratory_rate}")
    if observation.blood_sugar is not None:
        parts.append(f"BG {float(observation.blood_sugar)}")
    if observation.pain_score is not None:
        parts.append(f"Pain {observation.pain_score}/10")
    return ", ".join(parts)


# --------------------------------------------------------------------------
# summary cards
# --------------------------------------------------------------------------


@nursing_bp.get("/summary")
@clinical_only
def nursing_summary():
    """Counts for whichever nursing dashboard the caller is looking at."""
    viewer_id = get_jwt_identity()
    doctor = get_current_doctor()
    base = scope_assignments(NursingAssignment.query)
    active = base.filter(NursingAssignment.status == "active").all()
    refresh_for_assignments(active)

    now = datetime.utcnow()
    since = datetime.combine(now.date(), datetime.min.time())

    assignment_ids = [a.id for a in active]
    doses_today = 0
    missed_today = 0
    if assignment_ids:
        rows = (
            db.session.query(
                MedicationAdministration.status,
                db.func.count(MedicationAdministration.id),
            )
            .filter(
                MedicationAdministration.assignment_id.in_(assignment_ids),
                MedicationAdministration.created_at >= since,
            )
            .group_by(MedicationAdministration.status)
            .all()
        )
        for status, count in rows:
            doses_today += count
            if status == "missed":
                missed_today += count

    open_alerts = 0
    critical_alerts = 0
    if assignment_ids:
        alert_rows = (
            db.session.query(ClinicalAlert.severity, db.func.count(ClinicalAlert.id))
            .filter(
                ClinicalAlert.assignment_id.in_(assignment_ids),
                ClinicalAlert.status == "open",
            )
            .group_by(ClinicalAlert.severity)
            .all()
        )
        for severity, count in alert_rows:
            open_alerts += count
            if severity == "critical":
                critical_alerts += count

    # Doses still owed today across every active patient — the single number
    # that tells a nurse whether the round is finished.
    doses_due = 0
    for assignment in active:
        progress = _todays_medication_progress(assignment)
        doses_due += max(0, progress["expected"] - progress["logged"])

    return success(
        {
            "active_assignments": len(active),
            "doses_logged_today": doses_today,
            "doses_due_today": doses_due,
            "missed_today": missed_today,
            "open_alerts": open_alerts,
            "critical_alerts": critical_alerts,
            "unread_messages": sum(a.unread_messages_for(viewer_id) for a in active),
            "unreviewed_updates": sum(
                a.unreviewed_count() for a in active if doctor and a.doctor_id == doctor.id
            ),
            "assignments": [
                a.to_dict(
                    viewer_id=viewer_id,
                    for_doctor=bool(doctor and doctor.id == a.doctor_id),
                )
                for a in active[:10]
            ],
            "generated_at": to_utc_iso(now),
        }
    )
