"""Reading the audit trail.

Read-only: there is no route here that writes or deletes, because an audit log
you can edit is not an audit log. Entries are created by
`helpers/audit.audit()` inside the transaction of the change they describe.

The PA reads the whole trail — running the practice includes being able to
answer "who changed this patient's number, and when". The doctor reads the
history of any record belonging to a patient of theirs.
"""

from flask import Blueprint, request

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.decorators import clinical_read, front_desk_only
from portal.helpers.patient_access import can_access_patient
from portal.helpers.response import error, success
from portal.models.appointment import Appointment
from portal.models.audit_log import AuditLog
from portal.models.consultation import Consultation
from portal.models.patient import Patient
from portal.models.patient_case import PatientCase

audit_bp = Blueprint("audit", __name__)

DEFAULT_LIMIT = 100
MAX_LIMIT = 500

# For a doctor, an entity is readable only if it belongs to one of their own
# patients — so each kind has to say which patient it concerns. A record type
# absent from here has no patient behind it (`user`, `medicine_brand`) and
# stays PA-only, which is why this is a lookup table rather than a couple of
# if-statements: adding a record type without deciding who it belongs to leaves
# it closed, not open.
PATIENT_OF = {
    "patient": lambda rid: db.session.get(Patient, rid),
    "consultation": lambda rid: getattr(db.session.get(Consultation, rid), "patient", None),
    "case": lambda rid: getattr(db.session.get(PatientCase, rid), "patient", None),
    "appointment": lambda rid: getattr(db.session.get(Appointment, rid), "patient", None),
}


@audit_bp.get("")
@front_desk_only
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
        # Prefix match so "patient." pulls the whole patient vocabulary.
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
@clinical_read
def entity_history(entity, entity_id):
    """Everything that has happened to one record.

    Open to the doctor as well as the PA: reviewing the history of a patient
    they are responsible for is clinical work, not just oversight. "They are
    responsible for" is enforced by the same `can_access_patient` rule the
    patient, case and consultation routes apply, so all four agree.
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
