"""The patient record: registering one, correcting one, and finding one.

Registration is the PA's. The doctor may correct a record they are treating —
a wrong allergy noticed mid-consultation is theirs to fix — but creating and
removing registrations is desk work, because a patient joining the practice is
one accountable step taken by the person who met them.

**Registering does not, on its own, book anything.** The hospital version
raised a queue entry as part of registration, because everyone arriving at a
hospital front desk is arriving to be seen. A practice takes bookings by
phone for next Thursday, so the two acts are separate here — with
`book_now: true` on the form for the common case where the person registering
is also standing at the desk right now, which writes both in one transaction.
"""

import os
from datetime import date, datetime

from flask import Blueprint, request, send_from_directory
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.audit import (
    PATIENT_CREATED,
    PATIENT_DELETED,
    PATIENT_UPDATED,
    audit,
)
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.contact import normalize_email, normalize_phone
from portal.helpers.decorators import DOCTOR, PA, front_desk_only
from portal.helpers.notify import notify
from portal.helpers.patient_access import can_access_patient, scope_patients
from portal.helpers.patient_search import patient_search_filter
from portal.helpers.practice import practice_doctor
from portal.helpers.queue_helper import book_appointment
from portal.helpers.response import error, success
from portal.helpers.uploads import ImageUploadError, delete_image, save_image, upload_dir
from portal.models.appointment import OPEN_STATUSES, Appointment
from portal.models.consultation import Consultation
from portal.models.patient import Patient, normalize_blood_group
from portal.models.patient_case import PatientCase

patient_bp = Blueprint("patients", __name__)

PHOTOS_SUBDIR = "patients"

# A date of birth outside this range is a typo, not a patient. Without the
# floor, a mistyped year like "0001" silently produced an age of 2025.
MAX_AGE_YEARS = 130

GENDERS = ("male", "female", "other")

PATIENT_SCOPES = ("all", "consulted", "awaiting")


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


def _parse_age(raw):
    """Returns (age, error_message) for an age typed instead of a birth date."""
    if raw in (None, ""):
        return None, None
    try:
        age = int(raw)
    except (TypeError, ValueError):
        return None, "age must be a whole number of years"
    if age < 0 or age > MAX_AGE_YEARS:
        return None, f"age must be between 0 and {MAX_AGE_YEARS}"
    return age, None


def _in_queue():
    """Patient ids with an appointment that has not closed."""
    return db.session.query(Appointment.patient_id).filter(
        Appointment.status.in_(OPEN_STATUSES)
    )


def _has_completed_consultation():
    return db.session.query(Consultation.patient_id).filter(
        Consultation.status == "completed"
    )


# --------------------------------------------------------------------------
# reading
# --------------------------------------------------------------------------


@patient_bp.get("")
@jwt_required()
def list_patients():
    """The practice's patients.

    `?scope=` narrows to where they are in their journey:

      all        (default) everyone on the books. This is the Patients page,
                 and it is the default because a practice's patient list is a
                 directory first — the desk looks somebody up to ring them
                 back, whether or not they have ever been seen.
      consulted  seen and finished, and not currently booked in again.
      awaiting   booked, waiting or in consultation right now.

    `?search=` narrows any of the three by name, patient code, phone or email,
    matching on any part of any of them — "rah" finds Rahul, and it finds
    Sriram too, because the match is a substring and not a prefix. It never
    widens the caller's reach: the scoping below runs regardless.

    `?limit=` caps the rows, for pickers that want the first handful.
    """
    scope = request.args.get("scope", "all")
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
            Patient.id.notin_(_in_queue()),
        )
    elif scope == "awaiting":
        query = query.filter(Patient.id.in_(_in_queue()))

    query = query.order_by(Patient.created_at.desc())

    limit = request.args.get("limit", type=int)
    if limit and limit > 0:
        query = query.limit(min(limit, 200))

    return success([p.to_dict() for p in query.all()])


@patient_bp.get("/counts")
@jwt_required()
def patient_counts():
    """How many patients sit in each scope.

    Its own endpoint so the tabs can show counts without fetching every list —
    and so a count on a tab always agrees with the rows behind it, both being
    derived from the same filters.
    """
    scoped = scope_patients(Patient.query, get_current_doctor())
    consulted = scoped.filter(
        Patient.id.in_(_has_completed_consultation()),
        Patient.id.notin_(_in_queue()),
    ).count()
    awaiting = scoped.filter(Patient.id.in_(_in_queue())).count()
    return success({"consulted": consulted, "awaiting": awaiting, "total": scoped.count()})


@patient_bp.get("/<int:patient_id>")
@jwt_required()
def get_patient(patient_id):
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)
    if not can_access_patient(patient, get_current_doctor()):
        # Deliberately 404, not 403: confirming the record exists would leak
        # that somebody has a patient by this id.
        return error("Patient not found", status=404)
    return success(patient.to_dict())


# --------------------------------------------------------------------------
# writing
# --------------------------------------------------------------------------

# What the desk collects at registration, and may therefore correct afterwards.
# Everything clinical -- diagnoses, prescriptions, consultation summaries --
# lives on other tables that this route cannot reach at all.
EDITABLE_FIELDS = (
    "name",
    "gender",
    "phone",
    "email",
    "address",
    "blood_group",
    "emergency_contact_name",
    "emergency_contact_phone",
    "allergies",
    "medical_history",
    "existing_conditions",
    "notes",
)

# Who may write to a patient's registration -- the demographics and the photo.
#
# An allowlist, not a blocklist. The desk typed these details in, and the
# treating doctor owns the clinical record, so those are the two that may
# correct them. Written as an allowlist because that is what makes it hold
# without maintenance: a role added tomorrow gets no access until somebody
# decides it should.
PATIENT_EDIT_ROLES = (PA, DOCTOR)


def _may_edit_patient():
    """The refusal for a caller who may not write to a registration, or None."""
    if get_jwt().get("role") in PATIENT_EDIT_ROLES:
        return None
    return error(
        "Only the PA or the doctor can change a patient's details", status=403
    )


@patient_bp.post("")
@front_desk_only
def create_patient():
    """Registers a patient. The PA's, not the doctor's.

    A patient joins the practice through the desk, which is what makes
    registration one accountable step: the demographics and the patient code
    are recorded by the person who met them or took their call.

    `book_now: true` also books them into today's queue in the same
    transaction — the walk-in case, where registering and arriving are the same
    moment. Both are written together, so a patient registered as a walk-in is
    never left on file with nobody told they are waiting. Without the flag the
    patient is simply added to the books, to be booked later.
    """
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error("Patient name is required", status=422)

    dob, dob_error = _parse_dob(payload.get("dob"))
    if dob_error:
        return error(dob_error, status=422)

    age_years, age_error = _parse_age(payload.get("age"))
    if age_error:
        return error(age_error, status=422)

    gender = (payload.get("gender") or "").strip().lower() or None
    if gender and gender not in GENDERS:
        return error(f"gender must be one of: {', '.join(GENDERS)}", status=422)

    blood_group, blood_group_error = normalize_blood_group(payload.get("blood_group"))
    if blood_group_error:
        return error(blood_group_error, status=422)

    # Both optional on a patient record but held to the same shape as
    # everywhere else when given.
    phone, phone_error = normalize_phone(payload.get("phone"))
    if phone_error:
        return error(phone_error, status=422)

    email, email_error = normalize_email(payload.get("email"))
    if email_error:
        return error(email_error, status=422)

    emergency_phone, emergency_phone_error = normalize_phone(
        payload.get("emergency_contact_phone")
    )
    if emergency_phone_error:
        return error(f"Emergency contact: {emergency_phone_error}", status=422)

    # Not a form field. One doctor, resolved rather than chosen -- see
    # helpers/practice. None only before the practice has been set up at all,
    # which `book_appointment` reports properly if the caller also asked to
    # book; the registration itself is allowed through so the books can be
    # filled in before the doctor's account exists.
    doctor = practice_doctor()

    def _text(field, limit=5000):
        return (payload.get(field) or "").strip()[:limit] or None

    patient = Patient(
        name=name,
        gender=gender,
        dob=dob,
        age_years=None if dob else age_years,
        phone=phone,
        email=email,
        address=_text("address", 1000),
        blood_group=blood_group,
        emergency_contact_name=_text("emergency_contact_name", 150),
        emergency_contact_phone=emergency_phone,
        allergies=_text("allergies"),
        medical_history=_text("medical_history"),
        existing_conditions=_text("existing_conditions"),
        notes=_text("notes"),
        assigned_doctor_id=doctor.id if doctor else None,
    )
    db.session.add(patient)
    db.session.flush()  # assigns patient.id so the audit row can reference it

    audit(
        PATIENT_CREATED,
        entity="patient",
        entity_id=patient.id,
        detail=f"Registered {patient.name}",
    )

    appointment = None
    if payload.get("book_now"):
        appointment, failure = book_appointment(
            patient,
            reason=_text("reason", 1000),
            walk_in=True,
            actor_user_id=get_jwt_identity(),
        )
        if failure:
            # Nothing is committed, so the patient row goes with it. Rolled
            # back explicitly rather than left to the session teardown, so the
            # next request on this connection does not inherit a dirty session.
            db.session.rollback()
            return failure
    elif doctor and doctor.user_id:
        # The one place the doctor learns a patient exists before they go
        # looking. Only when nothing was booked -- `book_appointment` sends its
        # own, better notification ("waiting to be seen"), and two pings for
        # one registration is noise.
        notify(
            [doctor.user_id],
            title="New patient registered",
            body=f"{patient.name} ({patient.code}) has been added to the practice.",
            category="patient_assignment",
            link=f"/dashboard/patients/{patient.id}",
            exclude_user_id=get_jwt_identity(),
        )

    db.session.commit()
    dashboard_changed("patient_created")

    data = patient.to_dict()
    if appointment:
        # Returned alongside the patient because the caller just created both —
        # it saves the page a second request to find the row it caused.
        data["appointment"] = appointment.to_dict()
        message = f"{patient.name} registered and added to today's queue"
    else:
        message = f"{patient.name} registered"

    return success(data, message=message, status=201)


@patient_bp.patch("/<int:patient_id>")
@jwt_required()
def update_patient(patient_id):
    """Corrects a patient's registration details.

    Open to the PA (who typed them in) and to the doctor treating them — a
    wrong allergy spotted mid-consultation should not need the desk to fix.
    """
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    doctor = get_current_doctor()
    if doctor and not can_access_patient(patient, doctor):
        return error("Patient not found", status=404)
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

    # Everything is validated before anything is written, so a bad value
    # refuses the whole edit rather than saving the other fields and dropping
    # this one.
    normalised = {}

    if "blood_group" in payload:
        value, value_error = normalize_blood_group(payload.get("blood_group"))
        if value_error:
            return error(value_error, status=422)
        normalised["blood_group"] = value

    if "phone" in payload:
        value, value_error = normalize_phone(payload.get("phone"))
        if value_error:
            return error(value_error, status=422)
        normalised["phone"] = value

    if "emergency_contact_phone" in payload:
        value, value_error = normalize_phone(payload.get("emergency_contact_phone"))
        if value_error:
            return error(f"Emergency contact: {value_error}", status=422)
        normalised["emergency_contact_phone"] = value

    if "email" in payload:
        value, value_error = normalize_email(payload.get("email"))
        if value_error:
            return error(value_error, status=422)
        normalised["email"] = value

    changed = []

    if "dob" in payload:
        dob, dob_error = _parse_dob(payload.get("dob"))
        if dob_error:
            return error(dob_error, status=422)
        if patient.dob != dob:
            changed.append("dob")
        patient.dob = dob
        # A recorded age and a birth date would disagree the moment one of them
        # was edited, and `Patient.age` prefers the date — so the looser value
        # is dropped rather than left to contradict the exact one.
        if dob:
            patient.age_years = None

    if "age" in payload and not payload.get("dob"):
        age_years, age_error = _parse_age(payload.get("age"))
        if age_error:
            return error(age_error, status=422)
        if patient.age_years != age_years:
            changed.append("age")
        patient.age_years = age_years

    for field in EDITABLE_FIELDS:
        if field not in payload:
            continue
        if field in normalised:
            value = normalised[field]
        else:
            value = (payload.get(field) or "").strip() or None
            if field == "gender" and value:
                value = value.lower()
        if getattr(patient, field) != value:
            changed.append(field)
        setattr(patient, field, value)

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


@patient_bp.delete("/<int:patient_id>")
@front_desk_only
def delete_patient(patient_id):
    """Removes a registration that should never have existed — a duplicate, or
    a walk-in entered against the wrong person.

    Desk work, and only ever for a patient with nothing clinical on file. A
    consultation or a case is a medical record: it is what the practice is
    answerable for later, so a patient who has one is refused here rather than
    quietly taking their history down with them. Correct such a record, or
    leave it — deleting is not the tool.

    Appointments are not records in that sense. One raised for a patient being
    deleted has no consultation behind it, so it goes with them.
    """
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    blockers = []
    if Consultation.query.filter_by(patient_id=patient.id).count():
        blockers.append("consultation records")
    if PatientCase.query.filter_by(patient_id=patient.id).count():
        blockers.append("case records")
    if blockers:
        return error(
            f"{patient.name} has {' and '.join(blockers)} and cannot be deleted. "
            "Medical records are kept for audit — correct the patient's details instead.",
            status=409,
        )

    name = patient.name
    code = patient.code
    photo = patient.photo_path

    # Every appointment left is an unstarted booking (anything started has a
    # consultation, which is refused above), so removing them keeps the queue
    # from pointing at a patient who no longer exists.
    Appointment.query.filter_by(patient_id=patient.id).delete(synchronize_session=False)

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
# photo
# --------------------------------------------------------------------------


@patient_bp.post("/<int:patient_id>/photo")
@jwt_required()
def upload_patient_photo(patient_id):
    """Sets the patient's photo. Same writers as the rest of the registration —
    a photo identifies the person at the desk, so replacing it is the same kind
    of act as changing their name."""
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
