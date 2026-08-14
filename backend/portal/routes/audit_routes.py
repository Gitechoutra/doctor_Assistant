"""Reading the audit trail.

Admin-only, and read-only: there is no route here that writes or deletes,
because an audit log you can edit is not an audit log. Entries are created by
`helpers/audit.audit()` inside the transaction of the change they describe.
"""

from flask import Blueprint, request

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.decorators import role_required
from portal.helpers.patient_access import can_access_patient
from portal.helpers.response import error, success
from portal.models.appointment import Appointment
from portal.models.audit_log import AuditLog
from portal.models.consultation import Consultation
from portal.models.lab_request import LabRequest
from portal.models.nursing_assignment import NursingAssignment
from portal.models.patient import Patient
from portal.models.patient_case import PatientCase

audit_bp = Blueprint("audit", __name__)

DEFAULT_LIMIT = 100
MAX_LIMIT = 500

# For a doctor, an entity is readable only if it belongs to one of their own
# patients — so each kind has to say which patient it concerns. A record type
# absent from here has no patient behind it (`user`, `staff_shift`,
# `medicine_brand`) and stays admin-only, which is why this is a lookup table
# rather than a couple of if-statements: adding a record type without deciding
# who it belongs to leaves it closed, not open.
PATIENT_OF = {
    "patient": lambda rid: db.session.get(Patient, rid),
    "consultation": lambda rid: getattr(db.session.get(Consultation, rid), "patient", None),
    "case": lambda rid: getattr(db.session.get(PatientCase, rid), "patient", None),
    "appointment": lambda rid: getattr(db.session.get(Appointment, rid), "patient", None),
    "lab_request": lambda rid: getattr(db.session.get(LabRequest, rid), "patient", None),
    "nursing_assignment": lambda rid: getattr(
        db.session.get(NursingAssignment, rid), "patient", None
    ),
}


@audit_bp.get("")
@role_required("admin")
def list_audit_entries():
    """The whole trail, newest first, filterable by entity or by actor."""
    query = AuditLog.query

    entity = (request.args.get("entity") or "").strip()
    if entity:
        query = query.filter(AuditLog.entity == entity)

    entity_id = request.args.get("entity_id", type=int)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)

    user_id = request.args.get("user_id", type=int)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    action = (request.args.get("action") or "").strip()
    if action:
        # Prefix match so "nursing." pulls the whole nursing vocabulary.
        query = query.filter(AuditLog.action.like(f"{action}%"))

    limit = request.args.get("limit", type=int) or DEFAULT_LIMIT
    limit = max(1, min(limit, MAX_LIMIT))

    rows = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .all()
    )
    return success([r.to_dict() for r in rows])


@audit_bp.get("/entity/<entity>/<int:entity_id>")
@role_required("admin", "doctor")
def entity_history(entity, entity_id):
    """Everything that has happened to one record.

    Open to doctors as well as admins: reviewing the history of a patient or a
    nursing assignment they are responsible for is clinical work, not just
    oversight.

    "They are responsible for" is now enforced rather than merely intended.
    This route used to hand any doctor the trail of any record by id, and the
    trail is written in prose — "Registered Arjun Rao", "Updated allergies for
    …" — so it read out the names and details of other doctors' patients. The
    scoping below is the same `can_access_patient` rule the patient, case and
    consultation routes apply, so all four now agree.
    """
    if not entity.isidentifier():
        return error("Invalid entity", status=422)

    doctor = get_current_doctor()
    if doctor:
        resolve = PATIENT_OF.get(entity)
        if not resolve:
            return error("Forbidden: insufficient role", status=403)
        patient = resolve(entity_id)
        # A record that no longer exists is 404 rather than an empty list, so a
        # deleted id cannot be told apart from one belonging to someone else.
        if not patient or not can_access_patient(patient, doctor):
            return error("Record not found", status=404)

    rows = (
        AuditLog.query.filter(AuditLog.entity == entity, AuditLog.entity_id == entity_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(MAX_LIMIT)
        .all()
    )
    return success([r.to_dict() for r in rows])
