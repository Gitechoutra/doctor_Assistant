"""Reading the knowledge base of doctor-approved cases.

Read-only by design. Nothing here creates or edits a precedent — that only
ever happens as a side effect of a doctor signing off a real prescription, in
`consultation_routes`. An endpoint that let someone type a precedent in
directly would put unreviewed treatment into the system's suggestions, which
is exactly what the sign-off requirement exists to prevent.
"""

from flask import Blueprint, request

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.decorators import doctor_only
from portal.helpers.response import error, success
from portal.models.clinical_precedent import ClinicalPrecedent

knowledge_bp = Blueprint("knowledge", __name__)

LIST_LIMIT = 100


@knowledge_bp.get("")
@doctor_only
def list_precedents():
    """The approved cases the AI can draw on.

    Hospital-wide rather than scoped to the caller: the point of the knowledge
    base is that one doctor's approved treatment informs another's suggestions,
    so a doctor should be able to see the same body of cases their suggestions
    come from. Precedents carry no patient identity, so this exposes clinical
    practice rather than anyone's record.
    """
    query = ClinicalPrecedent.query

    status = request.args.get("status", "active")
    if status == "active":
        query = query.filter(ClinicalPrecedent.retired_at.is_(None))
    elif status == "retired":
        query = query.filter(ClinicalPrecedent.retired_at.isnot(None))
    elif status != "all":
        return error("status must be one of: active, retired, all", status=422)

    department_id = request.args.get("department_id", type=int)
    if department_id:
        query = query.filter(ClinicalPrecedent.department_id == department_id)

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                ClinicalPrecedent.diagnosis.ilike(like),
                ClinicalPrecedent.symptoms.ilike(like),
                ClinicalPrecedent.medicines.ilike(like),
            )
        )

    precedents = (
        query.order_by(
            # Most-relied-on first: a case other doctors have kept in their
            # own prescriptions says more about this hospital's practice than
            # one that was merely recorded.
            ClinicalPrecedent.times_accepted.desc(),
            ClinicalPrecedent.approved_at.desc(),
        )
        .limit(LIST_LIMIT)
        .all()
    )

    # The source consultation is the audit trail, so it goes to the roles that
    # audit — not to every reader of the knowledge base.
    include_source = get_current_doctor() is not None
    return success([p.to_dict(include_source=include_source) for p in precedents])


@knowledge_bp.get("/stats")
@doctor_only
def knowledge_stats():
    """How much the system has actually learned, for the dashboard."""
    active = ClinicalPrecedent.query.filter(ClinicalPrecedent.retired_at.is_(None))
    return success(
        {
            "active_precedents": active.count(),
            "retired_precedents": ClinicalPrecedent.query.filter(
                ClinicalPrecedent.retired_at.isnot(None)
            ).count(),
            # How often a suggestion drawn from an approved case survived the
            # reviewing doctor — the honest measure of whether the knowledge
            # base is helping rather than just growing.
            "times_suggested": int(
                db.session.query(db.func.coalesce(db.func.sum(ClinicalPrecedent.times_suggested), 0)).scalar()
            ),
            "times_accepted": int(
                db.session.query(db.func.coalesce(db.func.sum(ClinicalPrecedent.times_accepted), 0)).scalar()
            ),
        }
    )
