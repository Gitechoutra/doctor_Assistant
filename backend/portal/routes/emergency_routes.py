"""Emergency Cases — the parallel entry point for a patient who cannot wait
for the normal OP queue.

`create_appointment` requires the patient already have an assigned doctor and
a matching department; an accident, a stroke, an unconscious arrival has
neither yet. This blueprint is reception logging the arrival, any on-duty
doctor claiming it and working the assessment/decision directly on the case
row (not a Consultation — see `EmergencyCase`'s module docstring for why),
and the eventual normal OP linking back to it once one exists.

Role split mirrors the OP queue exactly: `create_appointment` is
receptionist-only (admin excluded, an operational act belonging to the desk),
`start_appointment` is doctor-only. Claiming, assessing and resolving an
emergency case are doctor-only the same way; creating one and the
administrative corrections (link/cancel) are receptionist(+admin) the same
way. Admin can read everything here, same as the rest of the hospital, but
never treats.
"""

from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity

from portal.extensions import db
from portal.helpers.audit import (
    EMERGENCY_CASE_CANCELLED,
    EMERGENCY_CASE_CLAIMED,
    EMERGENCY_CASE_CREATED,
    EMERGENCY_CASE_LINKED,
    EMERGENCY_CASE_REOPENED,
    EMERGENCY_CASE_RESOLVED,
    EMERGENCY_CASE_UPDATED,
    audit,
)
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import role_required
from portal.helpers.notify import department_doctor_user_ids, notify, role_user_ids
from portal.helpers.response import error, success
from portal.models.appointment import Appointment
from portal.models.department import Department
from portal.models.emergency_case import DECISIONS, SEVERITIES, STATUSES, EmergencyCase
from portal.models.patient import Patient

emergency_bp = Blueprint("emergency", __name__)

# Still an open episode — the default view, same shape as the OP queue's
# OPEN_STATUSES.
OPEN_STATUSES = ("waiting", "in_progress")


def _text(payload, field, limit=2000):
    value = payload.get(field)
    if value is None:
        return None
    value = str(value).strip()
    return value[:limit] or None


@emergency_bp.get("")
@role_required("admin", "doctor", "receptionist")
def list_emergency_cases():
    """The live emergency board, worst-severity-first then oldest-arrival-first
    — same "who needs attention next" ordering the OP queue uses, just keyed
    on severity ahead of time-in-queue.

    Defaults to open cases (waiting/in_progress), same as the OP queue
    defaulting to its own open statuses. A doctor sees unclaimed cases (to
    pick up) plus whichever they've already claimed — not the whole board,
    the same narrowing the OP queue applies per department.
    """
    status = request.args.get("status")
    query = EmergencyCase.query
    if status:
        if status not in STATUSES:
            return error(f"status must be one of: {', '.join(STATUSES)}", status=422)
        query = query.filter(EmergencyCase.status == status)
    else:
        query = query.filter(EmergencyCase.status.in_(OPEN_STATUSES))

    doctor = get_current_doctor()
    if doctor:
        query = query.filter(
            db.or_(EmergencyCase.doctor_id.is_(None), EmergencyCase.doctor_id == doctor.id)
        )

    severity_rank = db.case(
        (EmergencyCase.severity == "critical", 0),
        (EmergencyCase.severity == "serious", 1),
        (EmergencyCase.severity == "stable", 2),
        else_=3,
    )
    cases = query.order_by(severity_rank, EmergencyCase.arrived_at.asc()).all()
    return success([c.to_dict() for c in cases])


@emergency_bp.post("")
@role_required("receptionist")
def create_emergency_case():
    # Reception only — the same narrowing `create_appointment` applies, and
    # for the same reason: admitting someone is intake work, not something an
    # admin account self-serves.
    payload = request.get_json(silent=True) or {}

    patient_id = payload.get("patient_id")
    if not patient_id:
        return error("patient_id is required", status=422)
    patient = Patient.query.get(patient_id)
    if not patient:
        return error("Patient not found", status=404)

    reason = _text(payload, "reason")
    if not reason:
        return error("reason is required", status=422)

    severity = (payload.get("severity") or "serious").strip().lower()
    if severity not in SEVERITIES:
        return error(f"severity must be one of: {', '.join(SEVERITIES)}", status=422)

    department = None
    department_id = payload.get("department_id")
    if department_id:
        department = Department.query.get(department_id)
        if not department:
            return error("Department not found", status=404)

    case = EmergencyCase(
        patient_id=patient.id,
        department_id=department.id if department else None,
        registered_by_id=get_jwt_identity(),
        reason=reason,
        severity=severity,
        status="waiting",
    )
    db.session.add(case)
    db.session.flush()  # assigns case.id for the audit row and notification link

    # Whoever is on duty to see it: the department if reception knows one, the
    # whole doctor roster if not — plus admin, for monitoring. Unlike an OP,
    # there is no "the assigned doctor's own department" to narrow this to.
    # The case id rides along in the link rather than pointing straight at
    # `/dashboard/emergency/<id>`: the board is still the right landing page
    # for anyone who taps the row (a doctor who lost the race to a colleague
    # would 404 on the detail route), while `notification_routes` reads the
    # id back out to offer Claim on the notification itself.
    notify(
        department_doctor_user_ids(department.id) + role_user_ids("admin")
        if department
        else role_user_ids("doctor") + role_user_ids("admin"),
        title=f"Emergency — {patient.name}",
        body=f"{reason} ({severity})" + (f" — {department.name}" if department else ""),
        category="appointment",
        link=f"/dashboard/emergency?case={case.id}",
        exclude_user_id=get_jwt_identity(),
    )

    audit(
        EMERGENCY_CASE_CREATED,
        entity="emergency_case",
        entity_id=case.id,
        detail=f"{patient.name} logged as {severity} — {reason}",
    )
    db.session.commit()
    dashboard_changed("emergency_case_created")

    return success(case.to_dict(), message="Emergency case created", status=201)


@emergency_bp.get("/<int:case_id>")
@role_required("admin", "doctor", "receptionist")
def get_emergency_case(case_id):
    case = EmergencyCase.query.get(case_id)
    doctor = get_current_doctor()
    # Same "404, not 403" courtesy as _load_assignment — a doctor asking
    # after a case claimed by someone else is told it doesn't exist, not
    # shown who has it.
    if not case or (doctor and case.doctor_id not in (None, doctor.id)):
        return error("Emergency case not found", status=404)
    return success(case.to_dict())


@emergency_bp.post("/<int:case_id>/claim")
@role_required("doctor")
def claim_emergency_case(case_id):
    """Any on-duty doctor may claim an unclaimed case — this is the one place
    a doctor gets to act on a patient nobody assigned to them, which is the
    entire point of an emergency. Never overwrites an existing
    `patient.assigned_doctor_id`: access to a patient who already has a
    regular doctor comes from `helpers.patient_access.has_active_emergency_claim`
    instead, for exactly as long as the case is open, so that doctor is never
    displaced. But a patient with no doctor at all — an unidentified arrival
    just registered for this emergency — has nobody to be displaced, and
    without an owner the record goes dark the moment the case resolves and
    the claim-based access expires with it. Claiming fills that gap, once.
    """
    case = EmergencyCase.query.get(case_id)
    if not case:
        return error("Emergency case not found", status=404)

    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can claim an emergency case", status=403)

    if case.status == "in_progress" and case.doctor_id == doctor.id:
        return success(case.to_dict(), message="Already claimed by you")
    if case.status == "in_progress":
        return error(
            f"Already claimed by {case.doctor.user.name if case.doctor and case.doctor.user else 'another doctor'}",
            status=409,
        )
    if case.status != "waiting":
        return error("This emergency case is already closed", status=409)

    # Compare-and-set rather than "check, then write". The guards above run on
    # a row read a moment ago, so two doctors tapping Claim at the same instant
    # both pass them, and the second write would silently take a case the first
    # was already told they held. Repeating `status == "waiting"` inside the
    # UPDATE hands that decision to the database: exactly one of the two
    # updates a row, and the loser falls through to the 409 below.
    claimed = EmergencyCase.query.filter(
        EmergencyCase.id == case.id, EmergencyCase.status == "waiting"
    ).update(
        {
            "doctor_id": doctor.id,
            "status": "in_progress",
            "assessed_at": datetime.utcnow(),
        },
        synchronize_session=False,
    )
    if not claimed:
        db.session.rollback()
        current = EmergencyCase.query.get(case_id)
        if current and current.doctor_id == doctor.id:
            return success(current.to_dict(), message="Already claimed by you")
        holder = (
            current.doctor.user.name
            if current and current.doctor and current.doctor.user
            else "another doctor"
        )
        return error(f"Already claimed by {holder}", status=409)

    # `synchronize_session=False` left the in-session row holding its old
    # values; everything below (and `to_dict`) reads the claimed ones.
    db.session.refresh(case)

    if case.patient and not case.patient.assigned_doctor_id:
        case.patient.assigned_doctor_id = doctor.id

    audit(
        EMERGENCY_CASE_CLAIMED,
        entity="emergency_case",
        entity_id=case.id,
        detail=f"{case.patient.name if case.patient else 'Patient'} claimed by "
        f"{doctor.user.name if doctor.user else 'doctor ' + str(doctor.id)}",
    )
    db.session.commit()
    dashboard_changed("emergency_case_claimed")

    return success(case.to_dict(), message="Emergency case claimed")


def _load_owned_case(case_id, doctor):
    """Returns (case, error_response). Requires the case be claimed by this
    doctor and still open — the same "must own it" rule `update_assignment`
    applies to a nursing plan."""
    case = EmergencyCase.query.get(case_id)
    if not case:
        return None, error("Emergency case not found", status=404)
    if case.doctor_id != doctor.id:
        return None, error("This emergency case is claimed by another doctor", status=403)
    if case.status != "in_progress":
        return None, error("This emergency case is already closed", status=409)
    return case, None


@emergency_bp.patch("/<int:case_id>")
@role_required("doctor")
def update_emergency_case(case_id):
    """Assessment notes, treatment notes, decision, severity — everything the
    claiming doctor records while working the case."""
    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can update an emergency case", status=403)

    case, err = _load_owned_case(case_id, doctor)
    if err:
        return err

    payload = request.get_json(silent=True) or {}
    changed = []

    if "assessment_notes" in payload:
        case.assessment_notes = _text(payload, "assessment_notes", limit=8000)
        changed.append("assessment notes")
    if "treatment_notes" in payload:
        case.treatment_notes = _text(payload, "treatment_notes", limit=8000)
        changed.append("treatment notes")
    if "severity" in payload:
        severity = (payload.get("severity") or "").strip().lower()
        if severity not in SEVERITIES:
            return error(f"severity must be one of: {', '.join(SEVERITIES)}", status=422)
        case.severity = severity
        changed.append("severity")
    if "decision" in payload:
        decision = payload.get("decision")
        decision = (decision or "").strip().lower() or None
        if decision is not None and decision not in DECISIONS:
            return error(f"decision must be one of: {', '.join(DECISIONS)}", status=422)
        case.decision = decision
        changed.append("decision")

    if not changed:
        return error("Nothing to update", status=422)

    audit(
        EMERGENCY_CASE_UPDATED,
        entity="emergency_case",
        entity_id=case.id,
        detail=f"Updated {', '.join(changed)} for {case.patient.name if case.patient else case.code}",
    )
    db.session.commit()
    dashboard_changed("emergency_case_updated")

    return success(case.to_dict(), message="Emergency case updated")


@emergency_bp.post("/<int:case_id>/link-appointment")
@role_required("receptionist", "admin")
def link_appointment(case_id):
    """Manual correction/fallback for the automatic link `create_appointment`
    already sets — for an OP that existed before the emergency was logged, or
    that the automatic match missed."""
    case = EmergencyCase.query.get(case_id)
    if not case:
        return error("Emergency case not found", status=404)

    payload = request.get_json(silent=True) or {}
    appointment_id = payload.get("appointment_id")
    if not appointment_id:
        return error("appointment_id is required", status=422)

    appointment = Appointment.query.get(appointment_id)
    if not appointment or appointment.patient_id != case.patient_id:
        return error("That OP does not belong to this patient", status=422)

    case.linked_appointment_id = appointment.id
    audit(
        EMERGENCY_CASE_LINKED,
        entity="emergency_case",
        entity_id=case.id,
        detail=f"Linked OP #{appointment.id} to {case.code}",
    )
    db.session.commit()
    dashboard_changed("emergency_case_updated")

    return success(case.to_dict(), message="OP linked to emergency case")


@emergency_bp.post("/<int:case_id>/resolve")
@role_required("doctor")
def resolve_emergency_case(case_id):
    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can resolve an emergency case", status=403)

    case, err = _load_owned_case(case_id, doctor)
    if err:
        return err

    payload = request.get_json(silent=True) or {}
    if "decision" in payload:
        decision = (payload.get("decision") or "").strip().lower() or None
        if decision is not None and decision not in DECISIONS:
            return error(f"decision must be one of: {', '.join(DECISIONS)}", status=422)
        case.decision = decision

    case.status = "resolved"
    case.resolved_at = datetime.utcnow()
    case.resolved_by_id = get_jwt_identity()

    audit(
        EMERGENCY_CASE_RESOLVED,
        entity="emergency_case",
        entity_id=case.id,
        detail=f"{case.patient.name if case.patient else case.code} resolved"
        + (f" — {case.decision}" if case.decision else ""),
    )
    db.session.commit()
    dashboard_changed("emergency_case_resolved")

    return success(case.to_dict(), message="Emergency case resolved")


@emergency_bp.post("/<int:case_id>/reopen")
@role_required("doctor")
def reopen_emergency_case(case_id):
    """Undoes a resolve made in error — puts the case back in treatment for
    the same doctor. Mirrors `case_routes.reopen_case`: only the doctor who
    held it may reopen it, and only from `resolved` — a cancelled case was
    withdrawn as a mistaken registration, not paused, so it stays closed."""
    case = EmergencyCase.query.get(case_id)
    if not case:
        return error("Emergency case not found", status=404)

    doctor = get_current_doctor()
    if not doctor:
        return error("Only doctors can reopen an emergency case", status=403)
    if case.doctor_id != doctor.id:
        return error("This emergency case is claimed by another doctor", status=403)
    if case.status != "resolved":
        return error("Only a resolved case can be reopened", status=409)

    case.status = "in_progress"
    case.resolved_at = None
    case.resolved_by_id = None

    audit(
        EMERGENCY_CASE_REOPENED,
        entity="emergency_case",
        entity_id=case.id,
        detail=f"{case.patient.name if case.patient else case.code} reopened",
    )
    db.session.commit()
    dashboard_changed("emergency_case_reopened")

    return success(case.to_dict(), message="Emergency case reopened")


@emergency_bp.post("/<int:case_id>/cancel")
@role_required("admin", "doctor", "receptionist")
def cancel_emergency_case(case_id):
    """Withdraws a mis-registered case. Reception/admin may cancel any open
    case; a doctor may only cancel one they hold — the same ownership rule
    every other doctor-facing write on this case applies."""
    case = EmergencyCase.query.get(case_id)
    if not case:
        return error("Emergency case not found", status=404)
    if case.status not in OPEN_STATUSES:
        return error("This emergency case is already closed", status=409)

    doctor = get_current_doctor()
    if doctor and case.doctor_id not in (None, doctor.id):
        return error("This emergency case is claimed by another doctor", status=403)

    case.status = "cancelled"
    audit(
        EMERGENCY_CASE_CANCELLED,
        entity="emergency_case",
        entity_id=case.id,
        detail=f"Cancelled {case.code} for {case.patient.name if case.patient else 'patient'}",
    )
    db.session.commit()
    dashboard_changed("emergency_case_cancelled")

    return success(case.to_dict(), message="Emergency case cancelled")
