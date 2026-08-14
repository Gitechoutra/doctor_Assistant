import os
from datetime import date, datetime

from flask import Blueprint, request, send_from_directory
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.audit import (
    PATIENT_CREATED,
    PATIENT_DELETED,
    PATIENT_DISCHARGED,
    PATIENT_REASSIGNED,
    PATIENT_UPDATED,
    SURGERY_CLEARED,
    SURGERY_COMPLETED,
    SURGERY_MARKED,
    audit,
)
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.broadcast import dashboard_changed, nursing_changed
from portal.helpers.contact import normalize_email, normalize_phone
from portal.helpers.decorators import FRONT_DESK_ROLES, role_required
from portal.helpers.notify import notify
from portal.helpers.patient_access import can_access_patient, scope_patients
from portal.helpers.queue_helper import move_open_ops_to, raise_op
from portal.helpers.response import error, success
from portal.helpers.patient_search import patient_search_filter
from portal.helpers.surgery import refresh_surgery_stages
from portal.helpers.uploads import ImageUploadError, delete_image, save_image, upload_dir
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.doctor import Doctor
from portal.models.emergency_case import EmergencyCase
from portal.models.nursing_assignment import NursingAssignment
from portal.models.patient import MAX_OBSERVATION_DAYS, Patient, normalize_blood_group
from portal.models.patient_case import PatientCase

patient_bp = Blueprint("patients", __name__)

PHOTOS_SUBDIR = "patients"

# What counts as still being in the Appointments queue. Mirrors
# appointment_routes.OPEN_STATUSES -- named here rather than imported to avoid
# a circular import between the two route modules.
OPEN_APPOINTMENT_STATUSES = ("waiting", "in_progress")

# A date of birth outside this range is a typo, not a patient. Without the
# floor, a mistyped year like "0001" silently produced an age of 2025.
MAX_AGE_YEARS = 130


def _parse_dob(raw):
    """Returns (date, error_message). Both None means no DOB was supplied."""
    if not raw:
        return None, None
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None, "dob must be in YYYY-MM-DD format"

    today = date.today()
    if parsed > today:
        return None, "Date of birth cannot be in the future"
    if parsed.year < today.year - MAX_AGE_YEARS:
        return None, f"Date of birth cannot be more than {MAX_AGE_YEARS} years ago"
    return parsed, None


def _resolve_assigned_doctor(payload):
    """Returns (doctor, error_message).

    Always explicit: registration is reception's, and picking the treating
    doctor is the routing decision that registration exists to make. Nothing
    infers it, because the only caller who could be inferred from -- a doctor
    -- cannot reach this route.

    The department is checked here rather than left to `raise_op` below, so a
    doctor who has none is refused before any row is written -- the desk is
    told what is wrong with their choice instead of having the registration
    fail halfway through.
    """
    raw = payload.get("assigned_doctor_id")
    if raw in (None, ""):
        return None, "assigned_doctor_id is required — choose the doctor for this patient"

    doctor = Doctor.query.get(raw)
    if not doctor:
        return None, "Assigned doctor not found"
    if not doctor.department_id:
        return None, (
            f"Dr. {doctor.user.name if doctor.user else 'that doctor'} has no department "
            "set, so there is no queue to admit this patient into. Set their department "
            "in Staff Management, or choose another doctor."
        )
    return doctor, None


PATIENT_SCOPES = ("consulted", "awaiting", "all")


def _in_appointments():
    """Patient ids currently sitting in the Appointments queue.

    "In Appointments" is the appointment's own open status, not the
    consultation's — the queue is what Appointments renders, and a patient
    belongs to exactly one of the two sections at a time. Ending a
    consultation completes its appointment, which is the single moment the
    patient moves across.
    """
    return db.session.query(Appointment.patient_id).filter(
        Appointment.status.in_(OPEN_APPOINTMENT_STATUSES)
    )


def _has_completed_consultation():
    return db.session.query(Consultation.patient_id).filter(
        Consultation.status == "completed"
    )


@patient_bp.get("")
@jwt_required()
def list_patients():
    """The patient list, split by where the patient is in their journey.

    `?scope=` decides which:

      consulted  (default) seen and finished — a completed consultation, and
                 not currently back in the queue. This is the Patients page.
      awaiting   registered but never consulted, or waiting / in consultation
                 right now. These belong to Appointments; they are listed here
                 only so the front desk can find a new patient to raise an OP
                 for, which is the one thing that cannot happen from
                 Appointments alone.
      all        everything, for pickers that must be able to choose any
                 patient regardless of where they are.

    A patient is never in both `consulted` and `awaiting`: an open appointment
    moves them back to awaiting until that consultation is finished too.

    `?search=` narrows any of the three by name, patient code, phone or email.
    It never widens the caller's reach: the scoping below runs regardless, so a
    doctor searching finds only among their own patients.
    """
    scope = request.args.get("scope", "consulted")
    if scope not in PATIENT_SCOPES:
        allowed = ", ".join(PATIENT_SCOPES)
        return error(f"scope must be one of: {allowed}", status=422)

    query = scope_patients(Patient.query, get_current_doctor())

    search = patient_search_filter(request.args.get("search"))
    if search is not None:
        query = query.filter(search)

    if scope == "consulted":
        query = query.filter(
            Patient.id.in_(_has_completed_consultation()),
            Patient.id.notin_(_in_appointments()),
        )
    elif scope == "awaiting":
        query = query.filter(
            db.or_(
                Patient.id.in_(_in_appointments()),
                Patient.id.notin_(_has_completed_consultation()),
            )
        )

    patients = query.order_by(Patient.created_at.desc()).all()
    # A finished observation window is only visible to whoever reads the record
    # next — see helpers/surgery.
    refresh_surgery_stages(patients)
    return success([p.to_dict() for p in patients])


@patient_bp.get("/counts")
@jwt_required()
def patient_counts():
    """How many patients sit on each side of the split.

    Its own endpoint so the tabs can show counts without fetching both lists —
    and so the count on a tab always agrees with the rows behind it, both
    being derived from the same filters.
    """
    scoped = scope_patients(Patient.query, get_current_doctor())
    consulted = scoped.filter(
        Patient.id.in_(_has_completed_consultation()),
        Patient.id.notin_(_in_appointments()),
    ).count()
    awaiting = scoped.filter(
        db.or_(
            Patient.id.in_(_in_appointments()),
            Patient.id.notin_(_has_completed_consultation()),
        )
    ).count()
    return success({"consulted": consulted, "awaiting": awaiting, "total": scoped.count()})


@patient_bp.get("/<int:patient_id>")
@jwt_required()
def get_patient(patient_id):
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)
    if not can_access_patient(patient, get_current_doctor()):
        # Deliberately 404, not 403: confirming the record exists would leak
        # that another doctor has a patient by this id.
        return error("Patient not found", status=404)
    refresh_surgery_stages([patient])
    return success(patient.to_dict())


def _patient_assignment_link(patient):
    """Where a "New patient assigned to you" notification should send the doctor.

    A patient with a still-unclaimed Emergency Case needs that claimed before
    anything else — sending the doctor to the Patients page first would be a
    dead end, since claiming only happens from the Emergency Cases board.
    Everyone else goes straight to their own record.
    """
    open_case = EmergencyCase.query.filter_by(patient_id=patient.id, status="waiting").first()
    if open_case:
        return "/dashboard/emergency"
    return f"/dashboard/patients?patient_id={patient.id}"


@patient_bp.post("")
@role_required("receptionist")
def create_patient():
    """Registers a patient. Reception only -- not admin, not the doctor.

    A patient enters the hospital through the front desk, which is what makes
    admission one accountable step: the demographics, the patient code and the
    choice of treating doctor are all recorded by the person who met them. A
    doctor registering a patient would be assigning themselves the case, which
    is precisely the routing decision reception owns; admin monitors the
    hospital and administers accounts, and admits nobody.

    Narrower than FRONT_DESK_ROLES on purpose -- correcting a registration
    (`update_patient`) and re-routing one (`reassign_patient`) stay open to
    admin, because unsticking a bad record is administration. Creating one is
    not.

    **Registering a patient also raises their OP.** Somebody arriving at the
    front desk is arriving to be seen, so the registration and the queue entry
    are one act rather than two screens -- the desk used to have to remember to
    go to Appointments afterwards, and a patient whose second step was
    forgotten sat in the record visible to nobody, in no queue, waiting for a
    doctor who had never been told they were there.

    Both are written in one transaction, so a patient is never created without
    the OP that admits them: if the queue entry cannot be raised, the
    registration is refused rather than half-done.
    """
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error("Patient name is required", status=422)

    dob, dob_error = _parse_dob(payload.get("dob"))
    if dob_error:
        return error(dob_error, status=422)

    doctor, doctor_error = _resolve_assigned_doctor(payload)
    if doctor_error:
        return error(doctor_error, status=422)

    blood_group, blood_group_error = normalize_blood_group(payload.get("blood_group"))
    if blood_group_error:
        return error(blood_group_error, status=422)

    # Both optional on a patient record -- somebody brought in unconscious has
    # neither -- but held to the same shape as everywhere else when given.
    phone, phone_error = normalize_phone(payload.get("phone"))
    if phone_error:
        return error(phone_error, status=422)

    email, email_error = normalize_email(payload.get("email"))
    if email_error:
        return error(email_error, status=422)

    # How the OP was paid for, recorded by reception at the same moment as
    # the OP itself -- a payment type with `paid` unset is dropped rather
    # than rejected, since it means nothing without the checkbox that gates
    # it in the UI.
    paid = bool(payload.get("paid"))
    payment_type = (payload.get("payment_type") or "").strip().lower() or None
    if paid and payment_type not in ("cash", "upi", "card"):
        return error("payment_type must be one of: cash, upi, card", status=422)
    if not paid:
        payment_type = None

    patient = Patient(
        name=name,
        gender=payload.get("gender") or None,
        dob=dob,
        phone=phone,
        email=email,
        blood_group=blood_group,
        allergies=payload.get("allergies") or None,
        medical_history=payload.get("medical_history") or None,
        assigned_doctor_id=doctor.id,
    )
    db.session.add(patient)
    db.session.flush()  # assigns patient.id so the audit row can reference it

    # The one place a doctor learns a patient exists before they go looking
    # for one -- there was no notification of any kind here before, so a new
    # patient sat invisible on the doctor's list until they happened to check
    # it themselves.
    if patient.assigned_doctor and patient.assigned_doctor.user_id:
        notify(
            [patient.assigned_doctor.user_id],
            title="New patient assigned to you",
            body=f"{patient.name} ({patient.code}) was registered and routed to you.",
            category="patient_assignment",
            link=_patient_assignment_link(patient),
            exclude_user_id=get_jwt_identity(),
        )

    audit(
        PATIENT_CREATED,
        entity="patient",
        entity_id=patient.id,
        detail=f"Registered {patient.name}",
    )

    # The queue entry, in the same transaction. `raise_op` derives the
    # department from the doctor just chosen, bills the OP (a first-ever
    # registration is always paid) and notifies that department's doctors.
    appointment, failure = raise_op(
        patient,
        reason=payload.get("reason"),
        actor_user_id=get_jwt_identity(),
        payment_type=payment_type,
    )
    if failure:
        # Nothing is committed, so the patient row goes with it. Rolled back
        # explicitly rather than left to the session teardown, so the next
        # request on this connection does not inherit a dirty session.
        db.session.rollback()
        return failure

    db.session.commit()
    dashboard_changed("patient_created")

    data = patient.to_dict()
    # The OP is returned alongside the patient because the caller just created
    # both -- the front desk needs the queue entry it was given, and having it
    # here saves the page a second request to find the row it already caused.
    data["appointment"] = appointment.to_dict()

    department_name = data["appointment"]["department"] or "the"
    return success(
        data,
        message=f"{patient.name} registered and added to the {department_name} queue",
        status=201,
    )


# What the front desk collects at registration, and may therefore correct
# afterwards. Everything clinical -- diagnoses, prescriptions, consultation
# summaries -- lives on other tables that reception cannot reach at all.
EDITABLE_FIELDS = ("name", "gender", "phone", "email", "blood_group", "allergies", "medical_history")

GENDERS = ("male", "female", "other")

# Who may write to a patient's registration -- the demographics and the photo.
#
# An allowlist, not "everyone except nurses". The blocklist this replaces named
# the one role anybody had thought about, so every role added since -- the
# pharmacist, the lab technician, the accountant -- fell through it and could
# rewrite any patient's name, phone, blood group or allergies. None of them
# reach this screen in the UI, which is why it went unnoticed: the check was
# the only thing standing between a stale token and the whole patient table.
#
# The front desk typed these details in, and the treating doctor owns the
# clinical record, so those are the two that may correct them. Anybody else is
# refused by not being named here, which is the point -- a role added tomorrow
# gets no access until somebody decides it should.
PATIENT_EDIT_ROLES = FRONT_DESK_ROLES + ("doctor",)


def _may_edit_patient():
    """The refusal for a caller who may not write to a registration, or None.

    Nurses get their own message because they are the one role with a real
    reason to be on the patient's record and a real reason to be told why this
    particular action is not theirs.
    """
    role = get_jwt().get("role")
    if role in PATIENT_EDIT_ROLES:
        return None
    if role == "nurse":
        return error("Nurses cannot edit patient registration details", status=403)
    return error(
        "Only the front desk or the treating doctor can change a patient's details",
        status=403,
    )


@patient_bp.patch("/<int:patient_id>")
@jwt_required()
def update_patient(patient_id):
    """Corrects a patient's registration details.

    Open to the front desk (who typed them in the first place) and to the
    treating doctor. Deliberately excludes `assigned_doctor_id`: rerouting a
    patient is a separate, front-desk-only action below, so a doctor cannot
    quietly hand their patient away -- or claim someone else's -- through the
    edit form.
    """
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    doctor = get_current_doctor()
    if doctor and not can_access_patient(patient, doctor):
        return error("Patient not found", status=404)
    # A nurse works from the record the doctor set; they don't edit demographics,
    # and neither does anybody outside PATIENT_EDIT_ROLES.
    refusal = _may_edit_patient()
    if refusal:
        return refusal

    payload = request.get_json(silent=True) or {}

    if "name" in payload and not (payload.get("name") or "").strip():
        return error("Patient name cannot be empty", status=422)

    if "gender" in payload:
        gender = (payload.get("gender") or "").strip().lower()
        if gender and gender not in GENDERS:
            return error(f"gender must be one of: {', '.join(GENDERS)}", status=422)

    # Validated before anything is written, so a bad value refuses the whole
    # edit rather than saving the other fields and dropping this one.
    blood_group = None
    if "blood_group" in payload:
        blood_group, blood_group_error = normalize_blood_group(payload.get("blood_group"))
        if blood_group_error:
            return error(blood_group_error, status=422)

    phone = None
    if "phone" in payload:
        phone, phone_error = normalize_phone(payload.get("phone"))
        if phone_error:
            return error(phone_error, status=422)

    email = None
    if "email" in payload:
        email, email_error = normalize_email(payload.get("email"))
        if email_error:
            return error(email_error, status=422)

    if "dob" in payload:
        dob, dob_error = _parse_dob(payload.get("dob"))
        if dob_error:
            return error(dob_error, status=422)
        patient.dob = dob

    changed = []
    for field in EDITABLE_FIELDS:
        if field not in payload:
            continue
        value = (payload.get(field) or "").strip() or None
        if field == "gender" and value:
            value = value.lower()
        # Already validated and normalised above; "o+" is stored as "O+" and
        # an address as its lowercase form.
        if field == "blood_group":
            value = blood_group
        if field == "phone":
            value = phone
        if field == "email":
            value = email
        if getattr(patient, field) != value:
            changed.append(field)
        setattr(patient, field, value)
    if "dob" in payload:
        changed.append("dob")

    if not changed:
        return success(patient.to_dict(), message="No changes")

    audit(
        PATIENT_UPDATED,
        entity="patient",
        entity_id=patient.id,
        detail=f"Updated {', '.join(changed)} for {patient.name}",
    )
    db.session.commit()
    dashboard_changed("patient_updated")

    return success(patient.to_dict(), message="Patient updated")


@patient_bp.patch("/<int:patient_id>/assignment")
@role_required(*FRONT_DESK_ROLES)
def reassign_patient(patient_id):
    """Moves a patient to a different doctor. Front-desk work: a doctor
    can't hand their own patient away, or claim someone else's."""
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    payload = request.get_json(silent=True) or {}
    raw = payload.get("assigned_doctor_id")
    if raw in (None, ""):
        return error("assigned_doctor_id is required", status=422)

    doctor = Doctor.query.get(raw)
    if not doctor:
        return error("Assigned doctor not found", status=404)

    patient.assigned_doctor_id = doctor.id

    # The OP they are waiting on moves with them. Left behind it would sit in
    # the previous doctor's queue for a patient who is no longer theirs, and if
    # the new doctor is in another department it would belong to no queue at
    # all. Consultations already under way are not touched.
    moved = move_open_ops_to(patient, doctor)

    if doctor.user_id:
        notify(
            [doctor.user_id],
            title="New patient assigned to you",
            body=f"{patient.name} ({patient.code}) was routed to you."
            + (" Their open OP is now in your queue." if moved else ""),
            category="patient_assignment",
            link=_patient_assignment_link(patient),
            exclude_user_id=get_jwt_identity(),
        )

    audit(
        PATIENT_REASSIGNED,
        entity="patient",
        entity_id=patient.id,
        detail=f"{patient.name} routed to {doctor.user.name if doctor.user else 'doctor ' + str(doctor.id)}",
    )
    db.session.commit()
    dashboard_changed("patient_reassigned")

    return success(patient.to_dict(), message="Patient reassigned")


@patient_bp.delete("/<int:patient_id>")
@role_required(*FRONT_DESK_ROLES)
def delete_patient(patient_id):
    """Removes a registration the front desk should never have created — a
    duplicate, or a walk-in entered against the wrong person.

    Front-desk work, and only ever for a patient with nothing clinical on
    file. A consultation, a case, a nursing record or an emergency case with
    something actually recorded on it is a medical record: it is what the
    hospital is answerable for later, so a patient who has one is refused
    here rather than quietly taking their history down with them. Correct
    such a record, or leave it — deleting is not the tool.

    Queue entries are not records in that sense. An OP raised for a patient
    who is being deleted has no consultation behind it, so it goes with
    them — and so does an emergency case nobody ever claimed, or claimed and
    cancelled before anything was written on it.
    """
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    blockers = []
    if Consultation.query.filter_by(patient_id=patient.id).count():
        blockers.append("consultation records")
    if PatientCase.query.filter_by(patient_id=patient.id).count():
        blockers.append("case records")
    if NursingAssignment.query.filter_by(patient_id=patient.id).count():
        blockers.append("nursing records")
    # An emergency case with nothing recorded on it yet (never claimed, or
    # cancelled as a mistaken registration before a doctor ever assessed the
    # patient) is a queue entry like an Appointment, not a clinical record --
    # removed the same way, below. One with assessment notes, treatment notes
    # or a decision on file is the doctor's account of what happened, and is
    # a medical record exactly like a Consultation.
    if EmergencyCase.query.filter(
        EmergencyCase.patient_id == patient.id,
        db.or_(
            EmergencyCase.assessment_notes.isnot(None),
            EmergencyCase.treatment_notes.isnot(None),
            EmergencyCase.decision.isnot(None),
        ),
    ).count():
        blockers.append("emergency case records")
    if blockers:
        return error(
            f"{patient.name} has {' and '.join(blockers)} and cannot be deleted. "
            "Medical records are kept for audit — correct the patient's details instead.",
            status=409,
        )

    name = patient.name
    code = patient.code
    photo = patient.photo_path

    # Every appointment left is an unstarted queue entry (anything started has
    # a consultation, which is refused above), so removing them keeps the
    # queue from pointing at a patient who no longer exists.
    Appointment.query.filter_by(patient_id=patient.id).delete(synchronize_session=False)
    # Same reasoning for an emergency case with nothing recorded on it --
    # the blockers above already refused anything that does.
    EmergencyCase.query.filter_by(patient_id=patient.id).delete(synchronize_session=False)

    audit(
        PATIENT_DELETED,
        entity="patient",
        entity_id=patient.id,
        detail=f"Deleted {name} ({code})",
    )
    db.session.delete(patient)
    try:
        db.session.commit()
    except Exception as exc:  # noqa: BLE001 - surface a DB failure as clean JSON
        db.session.rollback()
        return error(f"Could not delete this patient: {exc}", status=500)

    # Only once the row is gone: a failed commit must not leave the record
    # pointing at a file that has already been removed from disk.
    delete_image(photo, PHOTOS_SUBDIR)

    dashboard_changed("patient_deleted")
    return success({"id": patient_id}, message=f"{name} deleted")


# --------------------------------------------------------------------------
# the surgical pathway
# --------------------------------------------------------------------------
#
# Nursing care exists for the days after an operation, so a patient is only
# handed to a nurse once a doctor has said their case needs surgery. These four
# routes are the whole pathway:
#
#   POST   /patients/<id>/surgery            mark the case as needing surgery
#   DELETE /patients/<id>/surgery            it doesn't after all
#   POST   /patients/<id>/surgery/complete   operated; start the observation
#   POST   /patients/<id>/discharge          done; the nurse's watch ends
#
# All four are the treating doctor's, and the same doctor-owns-the-plan rule
# the nursing module runs on applies: a nurse records what happened, a doctor
# decides what happens next.


def _load_for_surgery(patient_id):
    """Returns (patient, doctor, error_response) for a pathway route."""
    doctor = get_current_doctor()
    if not doctor:
        return None, None, error("Only the treating doctor can do this", status=403)

    patient = Patient.query.get(patient_id)
    if not patient:
        return None, None, error("Patient not found", status=404)
    if not can_access_patient(patient, doctor):
        return None, None, error("Patient not found", status=404)
    return patient, doctor, None


def _observation_days(payload):
    """Returns (days, error_message). Absent reads as None -- the model falls
    back to its own default rather than this route inventing a second one."""
    raw = payload.get("observation_days")
    if raw in (None, ""):
        return None, None
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return None, "observation_days must be a whole number"
    if not 1 <= days <= MAX_OBSERVATION_DAYS:
        return None, f"observation_days must be between 1 and {MAX_OBSERVATION_DAYS}"
    return days, None


def _active_assignment(patient):
    return NursingAssignment.query.filter_by(patient_id=patient.id, status="active").first()


@patient_bp.post("/<int:patient_id>/surgery")
@role_required("doctor")
def mark_surgery_required(patient_id):
    """The doctor deciding this case needs surgery.

    Nothing else opens the nurse hand-off — `POST /nursing/assignments`
    refuses a patient who has not been through here.
    """
    patient, _doctor, failure = _load_for_surgery(patient_id)
    if failure:
        return failure

    payload = request.get_json(silent=True) or {}
    days, days_error = _observation_days(payload)
    if days_error:
        return error(days_error, status=422)

    notes = (payload.get("surgery_notes") or "").strip()[:5000] or None
    patient.mark_surgery_required(notes=notes, observation_days=days)

    audit(
        SURGERY_MARKED,
        entity="patient",
        entity_id=patient.id,
        detail=f"{patient.name} marked as requiring surgery",
    )
    db.session.commit()
    dashboard_changed("surgery_marked")

    return success(patient.to_dict(), message=f"{patient.name} marked for surgery")


@patient_bp.delete("/<int:patient_id>/surgery")
@role_required("doctor")
def clear_surgery(patient_id):
    """Undoes the decision above — the case turned out not to need surgery.

    Refused once a nurse is actually watching the patient: taking the case off
    the pathway would strand an assignment that only exists because of it.
    Close the nursing assignment first, which discharges them properly.
    """
    patient, _doctor, failure = _load_for_surgery(patient_id)
    if failure:
        return failure

    if patient.surgery_stage is None:
        return success(patient.to_dict(), message="No surgery was planned")
    if _active_assignment(patient):
        return error(
            f"{patient.name} is under nursing care. Discharge them first.",
            status=409,
        )

    patient.clear_surgery()
    audit(
        SURGERY_CLEARED,
        entity="patient",
        entity_id=patient.id,
        detail=f"Surgery no longer planned for {patient.name}",
    )
    db.session.commit()
    dashboard_changed("surgery_cleared")

    return success(patient.to_dict(), message="Surgery is no longer planned")


@patient_bp.post("/<int:patient_id>/surgery/complete")
@role_required("doctor")
def complete_surgery(patient_id):
    """Surgery is done: the patient moves to post-operative observation.

    The nurse already assigned stays assigned and their watch is re-dated from
    now, because the days that matter are the days after the operation, not the
    days since the hand-off was arranged.
    """
    patient, _doctor, failure = _load_for_surgery(patient_id)
    if failure:
        return failure

    if patient.surgery_stage is None:
        return error(
            f"{patient.name} has not been marked as needing surgery", status=409
        )
    if patient.surgery_stage != "required":
        return error(f"{patient.name} is already past surgery", status=409)

    payload = request.get_json(silent=True) or {}
    days, days_error = _observation_days(payload)
    if days_error:
        return error(days_error, status=422)

    ends_at = patient.complete_surgery(observation_days=days)

    assignment = _active_assignment(patient)
    if assignment:
        assignment.care_type = "post_surgery"
        assignment.ends_at = ends_at
        if assignment.nurse:
            notify(
                [assignment.nurse.user_id],
                title="Post-operative observation started",
                body=(
                    f"{patient.name} is out of surgery and under observation for "
                    f"{patient.observation_days_planned} day"
                    f"{'' if patient.observation_days_planned == 1 else 's'}."
                ),
                category="nursing",
                link=f"/nurse/patients/{assignment.id}",
            )

    audit(
        SURGERY_COMPLETED,
        entity="patient",
        entity_id=patient.id,
        detail=(
            f"Surgery completed for {patient.name}; observing for "
            f"{patient.observation_days_planned} days"
        ),
    )
    db.session.commit()
    if assignment:
        nursing_changed("assignment_updated", assignment.id)
    dashboard_changed("surgery_completed")

    return success(patient.to_dict(), message=f"{patient.name} is under observation")


@patient_bp.post("/<int:patient_id>/discharge")
@role_required("doctor")
def discharge_patient(patient_id):
    """Ends the surgical pathway, and with it the nurse's assignment.

    Available at any point after surgery — the observation window elapsing
    moves the patient to `ready_for_discharge`, which is a prompt, not a
    discharge. A patient still unwell on day four is still the nurse's patient
    until the doctor here says otherwise.
    """
    patient, _doctor, failure = _load_for_surgery(patient_id)
    if failure:
        return failure

    if patient.surgery_stage is None:
        return error(f"{patient.name} is not under post-operative care", status=409)
    if patient.surgery_stage == "required":
        return error(
            f"{patient.name} has not had surgery yet. Mark the surgery completed first, "
            "or cancel it if it is no longer needed.",
            status=409,
        )

    payload = request.get_json(silent=True) or {}
    summary = (payload.get("summary") or "").strip()[:5000] or None

    assignment = _active_assignment(patient)
    if assignment:
        assignment.status = "completed"
        assignment.completed_at = datetime.utcnow()
        if assignment.nurse:
            notify(
                [assignment.nurse.user_id],
                title="Patient discharged",
                body=(
                    f"{patient.name} has been discharged and is off your list."
                    + (f" {summary}" if summary else "")
                )[:255],
                category="nursing",
                link=f"/nurse/patients/{assignment.id}",
            )

    patient.clear_surgery()

    audit(
        PATIENT_DISCHARGED,
        entity="patient",
        entity_id=patient.id,
        detail=f"{patient.name} discharged from post-operative care",
    )
    db.session.commit()
    if assignment:
        nursing_changed("assignment_closed", assignment.id)
    dashboard_changed("patient_discharged")

    return success(patient.to_dict(), message=f"{patient.name} discharged")


@patient_bp.post("/<int:patient_id>/photo")
@jwt_required()
def upload_patient_photo(patient_id):
    """Sets the patient's photo. Same writers as the rest of the registration —
    a photo identifies the person at the counter, so replacing it is the same
    kind of act as changing their name."""
    patient = Patient.query.get(patient_id)
    if not patient or not can_access_patient(patient, get_current_doctor()):
        return error("Patient not found", status=404)
    refusal = _may_edit_patient()
    if refusal:
        return refusal

    try:
        filename = save_image(request.files.get("photo"), PHOTOS_SUBDIR)
    except ImageUploadError as exc:
        return error(exc.message, status=exc.status)

    previous = patient.photo_path
    patient.photo_path = filename
    db.session.commit()

    delete_image(previous, PHOTOS_SUBDIR)

    return success(patient.to_dict(), message="Patient photo updated")


@patient_bp.delete("/<int:patient_id>/photo")
@jwt_required()
def delete_patient_photo(patient_id):
    patient = Patient.query.get(patient_id)
    if not patient or not can_access_patient(patient, get_current_doctor()):
        return error("Patient not found", status=404)
    refusal = _may_edit_patient()
    if refusal:
        return refusal

    previous = patient.photo_path
    patient.photo_path = None
    db.session.commit()

    delete_image(previous, PHOTOS_SUBDIR)

    return success(patient.to_dict(), message="Patient photo removed")


@patient_bp.get("/photo/<path:filename>")
def serve_patient_photo(filename):
    """Unauthenticated for the same reason avatars are — see serve_avatar."""
    directory = upload_dir(PHOTOS_SUBDIR)
    if not os.path.exists(os.path.join(directory, filename)):
        return error("Image not found", status=404)
    return send_from_directory(directory, filename, max_age=3600)
