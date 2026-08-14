"""A patient's course of treatment: its sessions, and the record that closes it.

Sessions themselves are created and ended by `consultation_routes` — this
module never writes to one. What it owns is the case around them: reading all
the sessions back in order, closing the case to produce the consolidated
summary and final prescription, and the doctor's sign-off on that final list.
"""

from datetime import datetime

from flask import Blueprint, current_app, request
from flask_jwt_extended import get_jwt_identity

from portal.ai import gemini_client
from portal.extensions import db
from portal.helpers.audit import (
    CASE_CLOSED,
    CASE_REOPENED,
    FINAL_PRESCRIPTION_EDITED,
    FINAL_PRESCRIPTION_UNVERIFIED,
    FINAL_PRESCRIPTION_VERIFIED,
    audit,
)
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.case_helper import session_context
from portal.helpers.decorators import clinical_only
from portal.helpers.formulary import prescribable_for, resolve_medicine
from portal.helpers.notify import notify, role_user_ids
from portal.helpers.patient_search import code_clauses, patient_search_filter
from portal.helpers.response import error, success
from portal.models.case_prescription import CasePrescription
from portal.models.patient_case import PatientCase

case_bp = Blueprint("cases", __name__)

VALID_CASE_STATUSES = ("open", "closed")
LIST_LIMIT = 100
MAX_PRESCRIPTION_ITEMS = 40


def _is_owning_doctor(case):
    doctor = get_current_doctor()
    return bool(doctor and doctor.id == case.doctor_id)


def _can_view(case):
    """Viewing follows the same rule as everywhere else in patient care: a
    doctor sees their own cases, admin/nursing see across the hospital."""
    doctor = get_current_doctor()
    return doctor is None or doctor.id == case.doctor_id


@case_bp.get("")
@clinical_only
def list_cases():
    query = PatientCase.query

    status = request.args.get("status")
    if status and status != "all":
        if status not in VALID_CASE_STATUSES:
            allowed = ", ".join(VALID_CASE_STATUSES)
            return error(f"status must be one of: {allowed}, all", status=422)
        query = query.filter(PatientCase.status == status)

    patient_id = request.args.get("patient_id", type=int)
    if patient_id:
        query = query.filter(PatientCase.patient_id == patient_id)

    doctor = get_current_doctor()
    if doctor:
        query = query.filter(PatientCase.doctor_id == doctor.id)

    # Name, patient code, phone, email or the reason the case was opened —
    # every typed word matching at least one of them, so half a name finds the
    # case and a second word narrows rather than widens. "CASE0007" and a bare
    # "7" find the case itself.
    search = patient_search_filter(
        request.args.get("search"),
        columns=(PatientCase.reason,),
        extra=lambda term: code_clauses(term, "case", PatientCase.id),
        relationship=PatientCase.patient,
    )
    if search is not None:
        query = query.filter(search)

    cases = (
        query.order_by(
            # Open cases first — those are the ones still needing something —
            # then most recently active.
            db.case((PatientCase.status == "open", 0), else_=1),
            db.func.coalesce(PatientCase.closed_at, PatientCase.opened_at, PatientCase.created_at).desc(),
        )
        .limit(LIST_LIMIT)
        .all()
    )
    return success([c.to_dict() for c in cases])


@case_bp.get("/<int:case_id>")
@clinical_only
def get_case(case_id):
    case = PatientCase.query.get(case_id)
    if not case:
        return error("Case not found", status=404)
    if not _can_view(case):
        return error("This case belongs to another doctor", status=403)

    data = case.to_dict(include_sessions=True)
    data["can_manage"] = _is_owning_doctor(case)
    return success(data)


def _replace_final_prescriptions(case, items):
    """Writes the consolidated medicine list, replacing whatever was there.

    Used by both the AI consolidation and the doctor's own edit, so there is
    one place that decides how a final prescription is stored — including the
    catalogue re-match, which has to reflect what is actually saved rather
    than what was originally suggested.
    """
    # Out-of-stock items included: a consolidated prescription merges what was
    # prescribed across the whole course of treatment, and a medicine the
    # shelf has since run out of was still legitimately prescribed.
    prescribable = prescribable_for(case.doctor, include_out_of_stock=True)

    for existing in list(case.final_prescriptions):
        db.session.delete(existing)
    db.session.flush()

    for item in items:
        brand, medicine_id = resolve_medicine(item["medicine_name"], prescribable)
        db.session.add(
            CasePrescription(
                case_id=case.id,
                brand_id=brand.id if brand else None,
                medicine_id=medicine_id,
                **item,
            )
        )


@case_bp.post("/<int:case_id>/close")
@clinical_only
def close_case(case_id):
    """Ends the course of treatment and produces the consolidated record.

    Every session keeps its own summary and prescription exactly as signed
    off; this adds one document on top of them. Re-closing a reopened case
    regenerates that document from scratch rather than patching the old one,
    so it can never describe a mixture of the sessions that existed then and
    the ones that exist now.
    """
    case = PatientCase.query.get(case_id)
    if not case:
        return error("Case not found", status=404)
    if not _is_owning_doctor(case):
        return error("Only the doctor treating this case can close it", status=403)
    if case.status == "closed":
        data = case.to_dict(include_sessions=True)
        data["can_manage"] = True
        return success(data, message="Case is already closed")

    running = case.open_session
    if running:
        return error(
            f"Session {running.session_number} is still in progress. End it before "
            "closing the case.",
            status=409,
        )

    sessions = case.completed_sessions
    if not sessions:
        return error("Cannot close a case with no completed consultation", status=422)

    unsummarised = [s for s in sessions if not s.summary]
    if unsummarised:
        # Consolidation is a merge of session summaries; one missing would
        # silently drop a whole visit out of the final record.
        numbers = ", ".join(str(s.session_number or s.id) for s in unsummarised)
        return error(f"Session {numbers} has no summary to consolidate", status=422)

    try:
        ai_result = gemini_client.consolidate_case(
            patient=case.patient.to_dict(),
            sessions=[session_context(s) for s in sessions],
        )
    except gemini_client.QuotaExceededError as exc:
        # The case is untouched — still open, every session intact — so closing
        # it again later is all that is needed.
        return error(
            f"{exc} The case is unchanged and can be closed again once the limit clears.",
            status=429,
        )
    except gemini_client.AIServiceUnavailableError as exc:
        # Already retried. Same guarantee as a quota refusal: nothing written.
        return error(f"{exc} The case is unchanged and can be closed again.", status=503)
    except Exception as exc:  # noqa: BLE001 - surface AI failure to the client
        current_app.logger.exception("Case consolidation failed for case %s", case.id)
        return error(f"AI consolidation failed: {exc}", status=502)

    case.status = "closed"
    case.closed_at = datetime.utcnow()
    case.closed_by = int(get_jwt_identity())
    case.final_summary = ai_result.get("overall_summary")
    case.progression = ai_result.get("progression")
    case.final_diagnosis = ai_result.get("final_diagnosis")
    case.final_follow_up_advice = "\n".join(ai_result.get("follow_up_advice") or [])
    case.final_lifestyle_advice = "\n".join(ai_result.get("lifestyle_advice") or [])
    case.consolidated_at = datetime.utcnow()
    # A fresh consolidation is a fresh document, so any earlier sign-off no
    # longer refers to the list on screen.
    case.final_verified_at = None
    case.final_verified_by = None

    valid_numbers = {s.session_number for s in sessions}
    cleaned = []
    for item in ai_result.get("consolidated_prescriptions") or []:
        name = (item.get("medicine_name") or "").strip()
        if not name:
            continue
        source = item.get("source_session_number")
        cleaned.append(
            {
                "medicine_name": name[:150],
                "dose": (item.get("dose") or "").strip()[:255] or None,
                "frequency": (item.get("frequency") or "").strip()[:255] or None,
                "duration": (item.get("duration") or "").strip()[:255] or None,
                "quantity": (item.get("quantity") or "").strip()[:80] or None,
                "instructions": (item.get("instructions") or "").strip()[:2000] or None,
                # Only kept when it names a session this case actually has —
                # a hallucinated number would misattribute a medicine.
                "source_session_number": source if source in valid_numbers else None,
                "note": (item.get("note") or "").strip()[:255] or None,
            }
        )
    _replace_final_prescriptions(case, cleaned)

    patient_name = case.patient.name if case.patient else "a patient"
    doctor_name = case.doctor.user.name if case.doctor and case.doctor.user else "A doctor"
    notify(
        role_user_ids("admin"),
        title="Course of treatment completed",
        body=(
            f"{doctor_name} closed {patient_name}'s case after {len(sessions)} session"
            f"{'' if len(sessions) == 1 else 's'}. The consolidated report is ready to verify."
        ),
        category="consultation",
        link=f"/dashboard/cases/{case.id}",
        exclude_user_id=get_jwt_identity(),
    )
    audit(
        CASE_CLOSED,
        entity="case",
        entity_id=case.id,
        detail=f"{case.code} closed for {patient_name} after {len(sessions)} session(s)",
    )

    try:
        db.session.commit()
    except Exception as exc:  # noqa: BLE001 - surface DB failure as a clean JSON error
        db.session.rollback()
        return error(f"Could not save the consolidated record: {exc}", status=500)

    dashboard_changed("case_closed")

    data = case.to_dict(include_sessions=True)
    data["can_manage"] = True
    return success(data, message="Case closed and consolidated")


@case_bp.post("/<int:case_id>/reopen")
@clinical_only
def reopen_case(case_id):
    """Puts a closed case back in treatment so another session can be added.

    The consolidated record is cleared rather than kept: it described a
    course of treatment that has just been declared unfinished, and leaving a
    signed final prescription in place while new sessions are recorded is
    exactly the stale-signature problem the verification rules exist to
    prevent. Closing again regenerates it over all sessions.
    """
    case = PatientCase.query.get(case_id)
    if not case:
        return error("Case not found", status=404)
    if not _is_owning_doctor(case):
        return error("Only the doctor treating this case can reopen it", status=403)
    if case.status == "open":
        data = case.to_dict(include_sessions=True)
        data["can_manage"] = True
        return success(data, message="Case is already open")

    case.status = "open"
    case.closed_at = None
    case.closed_by = None
    case.final_summary = None
    case.progression = None
    case.final_diagnosis = None
    case.final_follow_up_advice = None
    case.final_lifestyle_advice = None
    case.consolidated_at = None
    case.final_verified_at = None
    case.final_verified_by = None
    for existing in list(case.final_prescriptions):
        db.session.delete(existing)

    audit(
        CASE_REOPENED,
        entity="case",
        entity_id=case.id,
        detail=f"{case.code} reopened; consolidated record cleared for regeneration",
    )
    db.session.commit()
    dashboard_changed("case_reopened")

    data = case.to_dict(include_sessions=True)
    data["can_manage"] = True
    return success(data, message="Case reopened")


@case_bp.put("/<int:case_id>/prescriptions")
@clinical_only
def replace_final_prescriptions(case_id):
    """Replaces the consolidated prescription with the doctor's edited version.

    Same contract as a session's prescription: the AI merge is a draft, the
    doctor is the prescriber, and the whole list is sent so what is stored is
    exactly what was on screen.
    """
    case = PatientCase.query.get(case_id)
    if not case:
        return error("Case not found", status=404)
    if not _is_owning_doctor(case):
        return error("Only the doctor treating this case can edit its final prescription", status=403)
    if not case.is_consolidated:
        return error("Close the case first — there is no final prescription yet", status=409)
    if case.final_verified_at:
        return error(
            "This final prescription is verified and locked. Unlock it to make changes.",
            status=409,
        )

    payload = request.get_json(silent=True) or {}
    items = payload.get("prescriptions")
    if not isinstance(items, list):
        return error("prescriptions must be a list", status=422)
    if len(items) > MAX_PRESCRIPTION_ITEMS:
        return error(
            f"A final prescription can hold at most {MAX_PRESCRIPTION_ITEMS} medicines",
            status=422,
        )

    prescribable = prescribable_for(case.doctor, include_out_of_stock=True)

    cleaned = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            return error(f"Item {index + 1} is not valid", status=422)
        name = (item.get("medicine_name") or "").strip()
        if not name:
            return error(f"Item {index + 1} needs a medicine name", status=422)

        # Same rule as a session's prescription: a name the catalogue does not
        # know is only accepted when the doctor marked it as entered by hand.
        brand, _medicine_id = resolve_medicine(name, prescribable)
        is_custom = bool(item.get("is_custom"))
        if brand is None and _medicine_id is None and not is_custom:
            return error(
                f"“{name}” is not in this department's medicine list. Pick a stocked "
                "medicine, or mark it as a custom entry.",
                status=422,
            )

        source = item.get("source_session_number")
        cleaned.append(
            {
                "medicine_name": (brand.display_name if brand else name)[:150],
                "dose": (item.get("dose") or "").strip()[:255] or None,
                "frequency": (item.get("frequency") or "").strip()[:255] or None,
                "duration": (item.get("duration") or "").strip()[:255] or None,
                "quantity": (item.get("quantity") or "").strip()[:80] or None,
                "route": (item.get("route") or "").strip().lower()[:20] or None,
                "is_custom": is_custom and brand is None and _medicine_id is None,
                "instructions": (item.get("instructions") or "").strip()[:2000] or None,
                "notes": (item.get("notes") or "").strip()[:2000] or None,
                "source_session_number": source if isinstance(source, int) else None,
                "note": (item.get("note") or "").strip()[:255] or None,
            }
        )

    _replace_final_prescriptions(case, cleaned)
    audit(
        FINAL_PRESCRIPTION_EDITED,
        entity="case",
        entity_id=case.id,
        detail=f"{case.code} final prescription edited ({len(cleaned)} medicine(s))",
    )
    db.session.commit()

    data = case.to_dict(include_sessions=True)
    data["can_manage"] = True
    return success(data, message="Final prescription updated")


@case_bp.post("/<int:case_id>/prescriptions/verify")
@clinical_only
def verify_final_prescription(case_id):
    case = PatientCase.query.get(case_id)
    if not case:
        return error("Case not found", status=404)
    if not _is_owning_doctor(case):
        return error("Only the doctor treating this case can verify its final prescription", status=403)
    if case.status != "closed" or not case.is_consolidated:
        return error("Close the case before verifying its final prescription", status=409)

    case.final_verified_at = datetime.utcnow()
    case.final_verified_by = int(get_jwt_identity())
    audit(
        FINAL_PRESCRIPTION_VERIFIED,
        entity="case",
        entity_id=case.id,
        detail=(
            f"{case.code} consolidated prescription signed off for "
            f"{case.patient.name if case.patient else 'patient'}"
        ),
    )
    db.session.commit()
    dashboard_changed("final_prescription_verified")

    data = case.to_dict(include_sessions=True)
    data["can_manage"] = True
    return success(data, message="Final prescription verified")


@case_bp.delete("/<int:case_id>/prescriptions/verify")
@clinical_only
def unverify_final_prescription(case_id):
    case = PatientCase.query.get(case_id)
    if not case:
        return error("Case not found", status=404)
    if not _is_owning_doctor(case):
        return error("Only the doctor treating this case can change its verification", status=403)

    case.final_verified_at = None
    case.final_verified_by = None
    audit(
        FINAL_PRESCRIPTION_UNVERIFIED,
        entity="case",
        entity_id=case.id,
        detail=f"{case.code} consolidated prescription sign-off withdrawn",
    )
    db.session.commit()
    dashboard_changed("final_prescription_unverified")

    data = case.to_dict(include_sessions=True)
    data["can_manage"] = True
    return success(data, message="Verification withdrawn")
