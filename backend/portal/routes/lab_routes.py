"""The laboratory: test orders, results, and the discussion about each one.

Three parties, three different views of the same table:

  * a **doctor** sees the requests they ordered, and may create, verify and
    cancel them
  * a **lab technician** sees the requests assigned to them, and may move a
    request through collection, processing and completion, upload the report,
    and ask for the sample to be taken again
  * an **admin** sees everything and may reassign, because somebody has to be
    able to fix a technician going off sick

Nobody else gets in at all. Reception, nursing and pharmacy have no business
in a diagnostic result, so `@role_required(*LAB_ROLES)` gates the module and
`_visible_requests` narrows within it.

The discussion is stricter still. `_can_discuss` admits exactly the requesting
doctor and the assigned technician — not every doctor, not every technician,
not the department. A message belongs to one patient's one test, which is why
there is no endpoint here that lists messages across requests.
"""

import os
from datetime import datetime

from flask import Blueprint, request, send_file
from flask_jwt_extended import get_jwt_identity

from portal.extensions import db
from portal.helpers.audit import audit
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import current_role, role_required
from portal.helpers.notify import notify
from portal.helpers.patient_access import has_active_emergency_claim
from portal.helpers.patient_search import patient_search_filter
from portal.helpers.response import error, success
from portal.helpers.uploads import upload_dir
from portal.models.consultation import Consultation
from portal.models.department import Department
from portal.models.lab_request import (
    DOCTOR_STATUSES,
    LAB_PRIORITIES,
    LAB_TEST_CATALOGUE,
    STATUS_ORDER,
    TECHNICIAN_STATUSES,
    LabMessage,
    LabRequest,
)
from portal.models.patient import Patient
from portal.models.role import Role
from portal.models.user import User

lab_bp = Blueprint("lab", __name__)

# Everyone allowed anywhere near this module.
LAB_ROLES = ("admin", "doctor", "lab_technician")

LAB_ORDERED = "lab.ordered"
LAB_ASSIGNED = "lab.assigned"
LAB_STATUS_CHANGED = "lab.status_changed"
LAB_REPORT_UPLOADED = "lab.report_uploaded"
LAB_RECOLLECTION = "lab.recollection_requested"
LAB_VERIFIED = "lab.verified"
LAB_CANCELLED = "lab.cancelled"

REPORTS_SUBDIR = "lab_reports"
# A lab report is a scan or a PDF from an analyser. Deliberately not a general
# file drop: an executable or an archive has no business here.
ALLOWED_REPORT_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_REPORT_BYTES = 10 * 1024 * 1024

MAX_MESSAGE = 4000
MAX_NOTES = 4000
MAX_SUMMARY = 4000
MAX_REASON = 500

# Lab notifications ride the existing `report` category rather than a new
# enum member. A lab result *is* a report as far as the bell menu is
# concerned, and widening the notification enum would mean an ALTER on a
# table this feature otherwise never touches.
LAB_NOTIFY_CATEGORY = "report"


def _caller_id():
    return int(get_jwt_identity())


def _caller():
    return db.session.get(User, _caller_id())


def _is_admin():
    return current_role() == "admin"


def _is_doctor():
    return current_role() == "doctor"


def _is_technician():
    return current_role() == "lab_technician"


def _text(payload, field, limit):
    value = payload.get(field)
    if value is None:
        return None
    return str(value).strip()[:limit] or None


def _visible_requests(query):
    """Narrows a listing to what the caller is entitled to see.

    A doctor sees what they ordered; a technician sees what is assigned to
    them plus the unassigned pool, because an unclaimed request is work that
    still needs picking up and hiding it would strand it.
    """
    if _is_admin():
        return query
    caller_id = _caller_id()
    if _is_doctor():
        return query.filter(LabRequest.doctor_id == caller_id)
    return query.filter(
        db.or_(LabRequest.technician_id == caller_id, LabRequest.technician_id.is_(None))
    )


def _can_view(lab_request):
    """Whether the caller may open one specific request."""
    if _is_admin():
        return True
    caller_id = _caller_id()
    if _is_doctor():
        return lab_request.doctor_id == caller_id
    return lab_request.technician_id in (caller_id, None)


def _can_discuss(lab_request):
    """Who may read and write the discussion.

    Only the two people the test is actually between. An admin is allowed
    through for support, but is not a participant — `_notify_counterpart`
    never treats them as one.
    """
    if _is_admin():
        return True
    return _caller_id() in lab_request.participant_ids()


def _system_entry(lab_request, body):
    """Records a status change in the same thread as the conversation, so the
    history reads in one pass."""
    db.session.add(
        LabMessage(
            lab_request_id=lab_request.id,
            author_id=_caller_id(),
            kind="system",
            body=body,
        )
    )


def _notify_counterpart(lab_request, title, body):
    """Tells the other party. `exclude_user_id` drops whoever caused it, so a
    technician never gets a notification about their own upload."""
    notify(
        lab_request.participant_ids(),
        title,
        body=body,
        category=LAB_NOTIFY_CATEGORY,
        link=f"/lab/requests/{lab_request.id}",
        exclude_user_id=_caller_id(),
    )


def _resolve_technician(raw):
    """Returns (user_or_None, error). An empty value means "leave unassigned"."""
    if raw in (None, "", 0):
        return None, None
    try:
        user = db.session.get(User, int(raw))
    except (TypeError, ValueError):
        return None, "technician_id must be a number"
    if not user:
        return None, "That lab technician does not exist"
    if not user.is_active:
        return None, "That lab technician's account is disabled"
    if not user.role or user.role.name != "lab_technician":
        return None, "That account is not a lab technician"
    return user, None


# ---------------------------------------------------------------- reading --


@lab_bp.get("/options")
@role_required(*LAB_ROLES)
def lab_options():
    """What the ordering form needs: the suggested tests and who can run them."""
    technicians = (
        User.query.join(Role, User.role_id == Role.id)
        .filter(Role.name == "lab_technician", User.is_active.is_(True))
        .order_by(User.name)
        .all()
    )
    return success(
        {
            "catalogue": [
                {"name": name, "category": category, "specimen": specimen}
                for name, category, specimen in LAB_TEST_CATALOGUE
            ],
            "priorities": list(LAB_PRIORITIES),
            "technicians": [
                {
                    "id": t.id,
                    "name": t.name,
                    "avatar_url": t.avatar_url,
                    "lab_department": (
                        t.staff_profile.lab_department if t.staff_profile else None
                    ),
                }
                for t in technicians
            ],
            "departments": [
                {"id": d.id, "name": d.name}
                for d in Department.query.order_by(Department.name).all()
            ],
        }
    )


@lab_bp.get("/requests")
@role_required(*LAB_ROLES)
def list_requests():
    """The caller's lab requests, newest first."""
    query = _visible_requests(LabRequest.query)

    status = (request.args.get("status") or "").strip().lower()
    if status == "open":
        query = query.filter(LabRequest.status.notin_(("verified", "cancelled")))
    elif status and status != "all":
        if status not in STATUS_ORDER:
            return error("Unknown status", status=422)
        query = query.filter(LabRequest.status == status)

    raw_patient = (request.args.get("patient_id") or "").strip()
    if raw_patient:
        try:
            query = query.filter(LabRequest.patient_id == int(raw_patient))
        except ValueError:
            return error("patient_id must be a number", status=422)

    # `Patient.code` is derived from the id rather than stored, so it cannot be
    # filtered on directly — matching it was raising on every search typed into
    # this page. The shared filter reads the code back to an id instead, and
    # brings partial, case-insensitive, multi-word name matching with it.
    search = patient_search_filter(
        request.args.get("search"),
        columns=(LabRequest.test_name,),
        relationship=LabRequest.patient,
    )
    if search is not None:
        query = query.filter(search)

    rows = query.order_by(LabRequest.created_at.desc(), LabRequest.id.desc()).all()
    return success(
        {
            "items": [r.to_dict() for r in rows],
            # Lets the client render the right controls without re-deriving
            # the rule from the role.
            "can_order": _is_doctor() or _is_admin(),
            "can_process": _is_technician() or _is_admin(),
        }
    )


@lab_bp.get("/summary")
@role_required(*LAB_ROLES)
def lab_summary():
    """Counts for the dashboard cards, scoped exactly like the listing."""

    def count(*statuses):
        q = _visible_requests(LabRequest.query)
        if statuses:
            q = q.filter(LabRequest.status.in_(statuses))
        return q.count()

    return success(
        {
            "ordered": count("ordered"),
            "sample_collected": count("sample_collected"),
            "processing": count("processing"),
            "completed": count("completed"),
            "verified": count("verified"),
            "urgent_open": _visible_requests(LabRequest.query)
            .filter(
                LabRequest.priority == "urgent",
                LabRequest.status.notin_(("verified", "cancelled")),
            )
            .count(),
            "awaiting_recollection": _visible_requests(LabRequest.query)
            .filter(LabRequest.recollection_requested.is_(True), LabRequest.status == "ordered")
            .count(),
            "unassigned": _visible_requests(LabRequest.query)
            .filter(LabRequest.technician_id.is_(None), LabRequest.status != "cancelled")
            .count(),
            "total_open": count("ordered", "sample_collected", "processing", "completed"),
        }
    )


@lab_bp.get("/requests/<int:request_id>")
@role_required(*LAB_ROLES)
def get_request(request_id):
    """One request with its full history — messages and status entries
    interleaved, oldest first."""
    lab_request = db.session.get(LabRequest, request_id)
    # Not-yours reads as not-found, so the endpoint cannot be used to probe
    # which patients have which tests outstanding.
    if not lab_request or not _can_view(lab_request):
        return error("Lab request not found", status=404)

    data = lab_request.to_dict(include_messages=_can_discuss(lab_request))
    data["can_discuss"] = _can_discuss(lab_request)
    data["can_process"] = _is_admin() or (
        _is_technician() and lab_request.technician_id in (_caller_id(), None)
    )
    data["can_verify"] = _is_admin() or (_is_doctor() and lab_request.doctor_id == _caller_id())
    return success(data)


@lab_bp.get("/requests/<int:request_id>/report")
@role_required(*LAB_ROLES)
def download_report(request_id):
    lab_request = db.session.get(LabRequest, request_id)
    if not lab_request or not _can_view(lab_request):
        return error("Lab request not found", status=404)
    if not lab_request.report_file:
        return error("No report has been uploaded for this test yet", status=404)

    path = os.path.join(upload_dir(REPORTS_SUBDIR), lab_request.report_file)
    if not os.path.exists(path):
        return error("The report file is missing on the server", status=404)

    patient = (lab_request.patient.name if lab_request.patient else "patient").replace(" ", "_")
    test = lab_request.test_name.replace(" ", "_")[:60]
    extension = os.path.splitext(lab_request.report_file)[1]
    return send_file(
        path, as_attachment=True, download_name=f"{patient}_{test}_lab_report{extension}"
    )


# --------------------------------------------------------------- ordering --


@lab_bp.post("/requests")
@role_required("admin", "doctor")
def create_request():
    """A doctor orders a test for one of their patients."""
    payload = request.get_json(silent=True) or {}

    try:
        patient_id = int(payload.get("patient_id"))
    except (TypeError, ValueError):
        return error("patient_id is required", status=422)
    patient = db.session.get(Patient, patient_id)
    if not patient:
        return error("That patient does not exist", status=404)

    # A doctor may only order for a patient who is actually theirs — the same
    # rule every other patient-facing route applies. An on-duty doctor
    # treating this patient through a claimed Emergency Case counts too, same
    # as `can_access_patient` — see `helpers/patient_access`.
    caller = _caller()
    if _is_doctor():
        doctor_profile = caller.doctor_profile if caller else None
        if (
            doctor_profile
            and patient.assigned_doctor_id != doctor_profile.id
            and not has_active_emergency_claim(patient.id, doctor_profile.id)
        ):
            return error("That patient is not assigned to you", status=403)

    test_name = _text(payload, "test_name", 200)
    if not test_name:
        return error("test_name is required", status=422)

    priority = (payload.get("priority") or "routine").strip().lower()
    if priority not in LAB_PRIORITIES:
        return error(f"priority must be one of: {', '.join(LAB_PRIORITIES)}", status=422)

    technician, err = _resolve_technician(payload.get("technician_id"))
    if err:
        return error(err, status=422)

    consultation_id = payload.get("consultation_id") or None
    case_id = payload.get("case_id") or None
    if consultation_id:
        consultation = db.session.get(Consultation, int(consultation_id))
        if not consultation or consultation.patient_id != patient.id:
            return error("That consultation does not belong to this patient", status=422)
        # Inherit the case so a result files itself against the right course
        # of treatment without the doctor having to say so twice.
        case_id = case_id or consultation.case_id

    department_id = payload.get("department_id") or None
    if department_id and not db.session.get(Department, int(department_id)):
        return error("department_id does not exist", status=422)

    lab_request = LabRequest(
        patient_id=patient.id,
        consultation_id=int(consultation_id) if consultation_id else None,
        case_id=int(case_id) if case_id else None,
        test_name=test_name,
        test_category=_text(payload, "test_category", 100),
        specimen=_text(payload, "specimen", 100),
        priority=priority,
        clinical_notes=_text(payload, "clinical_notes", MAX_NOTES),
        doctor_id=_caller_id(),
        technician_id=technician.id if technician else None,
        department_id=int(department_id) if department_id else None,
        status="ordered",
    )
    db.session.add(lab_request)
    db.session.flush()

    _system_entry(
        lab_request,
        f"Ordered {test_name}"
        + (f" ({priority})" if priority == "urgent" else "")
        + (f" — assigned to {technician.name}" if technician else " — not yet assigned"),
    )

    if technician:
        notify(
            [technician.id],
            "New lab test assigned",
            body=f"{test_name} for {patient.name}",
            category=LAB_NOTIFY_CATEGORY,
            link=f"/lab/requests/{lab_request.id}",
            exclude_user_id=_caller_id(),
        )

    audit(
        LAB_ORDERED,
        entity="lab_request",
        entity_id=lab_request.id,
        detail=f"{test_name} for {patient.name}",
    )
    db.session.commit()
    dashboard_changed("lab.ordered")
    return success(lab_request.to_dict(), message="Lab test ordered", status=201)


@lab_bp.patch("/requests/<int:request_id>")
@role_required("admin", "doctor")
def update_request(request_id):
    """Edits the order itself, and reassigns the technician.

    Only before there is a result: changing which test was asked for after it
    has been run would silently relabel somebody's report.
    """
    lab_request = db.session.get(LabRequest, request_id)
    if not lab_request or not _can_view(lab_request):
        return error("Lab request not found", status=404)
    if _is_doctor() and lab_request.doctor_id != _caller_id():
        return error("Only the requesting doctor can change this order", status=403)

    payload = request.get_json(silent=True) or {}
    locked = lab_request.status in ("completed", "verified")

    if "technician_id" in payload:
        technician, err = _resolve_technician(payload.get("technician_id"))
        if err:
            return error(err, status=422)
        new_id = technician.id if technician else None
        if new_id != lab_request.technician_id:
            lab_request.technician_id = new_id
            _system_entry(
                lab_request,
                f"Reassigned to {technician.name}" if technician else "Unassigned",
            )
            if technician:
                notify(
                    [technician.id],
                    "Lab test assigned to you",
                    body=f"{lab_request.test_name} for "
                    f"{lab_request.patient.name if lab_request.patient else 'a patient'}",
                    category=LAB_NOTIFY_CATEGORY,
                    link=f"/lab/requests/{lab_request.id}",
                    exclude_user_id=_caller_id(),
                )
            audit(
                LAB_ASSIGNED,
                entity="lab_request",
                entity_id=lab_request.id,
                detail=f"{lab_request.test_name} -> {technician.name if technician else 'unassigned'}",
            )

    for field, limit in (
        ("test_name", 200),
        ("test_category", 100),
        ("specimen", 100),
        ("clinical_notes", MAX_NOTES),
    ):
        if field not in payload:
            continue
        if locked and field != "clinical_notes":
            return error(
                "The test itself can no longer be changed — a result has already been filed",
                status=409,
            )
        value = _text(payload, field, limit)
        if field == "test_name" and not value:
            return error("test_name cannot be empty", status=422)
        setattr(lab_request, field, value)

    if "priority" in payload:
        priority = (payload.get("priority") or "").strip().lower()
        if priority not in LAB_PRIORITIES:
            return error(f"priority must be one of: {', '.join(LAB_PRIORITIES)}", status=422)
        lab_request.priority = priority

    db.session.commit()
    return success(lab_request.to_dict(), message="Lab request updated")


# ------------------------------------------------------------- processing --


@lab_bp.patch("/requests/<int:request_id>/status")
@role_required(*LAB_ROLES)
def set_status(request_id):
    """Moves a request along.

    The split is the point: a technician may advance collection, processing
    and completion; only the requesting doctor may accept a result as
    `verified` or cancel the order. Neither may walk the status backwards —
    the way back to `ordered` is a recollection, which records a reason.
    """
    lab_request = db.session.get(LabRequest, request_id)
    if not lab_request or not _can_view(lab_request):
        return error("Lab request not found", status=404)

    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip().lower()
    if status not in STATUS_ORDER:
        return error("Unknown status", status=422)
    if status == lab_request.status:
        return success(lab_request.to_dict(), message="Status unchanged")

    if _is_technician():
        if status not in TECHNICIAN_STATUSES:
            return error(
                "A lab technician can set sample collected, processing or completed. "
                "Verifying a result is the requesting doctor's decision.",
                status=403,
            )
        if lab_request.technician_id not in (_caller_id(), None):
            return error("That test is assigned to another technician", status=403)
        # Picking up an unclaimed request is what assigns it.
        if lab_request.technician_id is None:
            lab_request.technician_id = _caller_id()
    elif _is_doctor():
        if status not in DOCTOR_STATUSES:
            return error(
                "A doctor can verify or cancel a lab request. Collection and "
                "processing are the lab technician's to record.",
                status=403,
            )
        if lab_request.doctor_id != _caller_id():
            return error("Only the requesting doctor can do that", status=403)
        if status == "verified" and lab_request.status != "completed":
            return error("Only a completed test can be verified", status=409)

    # Admins are exempt from the direction check — fixing a mis-clicked status
    # is exactly the kind of thing they are for.
    if not _is_admin() and status != "cancelled":
        if STATUS_ORDER[status] < STATUS_ORDER[lab_request.status]:
            return error(
                "A lab request cannot go backwards. Request a sample "
                "recollection if the specimen is no longer usable.",
                status=409,
            )

    previous = lab_request.status
    lab_request.status = status

    if status == "verified":
        lab_request.verified_by_id = _caller_id()
        lab_request.verified_at = datetime.utcnow()
    if status in ("sample_collected", "processing"):
        # Advancing past collection means a usable sample exists again.
        lab_request.recollection_requested = False

    label = status.replace("_", " ")
    _system_entry(lab_request, f"Status changed from {previous.replace('_', ' ')} to {label}")

    _notify_counterpart(
        lab_request,
        f"Lab test {label}",
        f"{lab_request.test_name} for "
        f"{lab_request.patient.name if lab_request.patient else 'a patient'}",
    )

    audit(
        LAB_VERIFIED
        if status == "verified"
        else LAB_CANCELLED
        if status == "cancelled"
        else LAB_STATUS_CHANGED,
        entity="lab_request",
        entity_id=lab_request.id,
        detail=f"{lab_request.test_name}: {previous} -> {status}",
    )
    db.session.commit()
    dashboard_changed("lab.status_changed")
    return success(lab_request.to_dict(), message=f"Marked {label}")


@lab_bp.post("/requests/<int:request_id>/report")
@role_required("admin", "lab_technician")
def upload_report(request_id):
    """Files the result and tells the doctor it is ready.

    Completing the request is part of uploading rather than a second step the
    technician has to remember: a filed report *is* a completed test, and
    leaving those two out of step is how a doctor ends up not knowing a result
    is waiting.
    """
    lab_request = db.session.get(LabRequest, request_id)
    if not lab_request or not _can_view(lab_request):
        return error("Lab request not found", status=404)
    if _is_technician() and lab_request.technician_id not in (_caller_id(), None):
        return error("That test is assigned to another technician", status=403)
    if lab_request.status == "cancelled":
        return error("That lab request was cancelled", status=409)

    uploaded = request.files.get("report")
    if not uploaded or not uploaded.filename:
        return error("A report file is required", status=422)

    extension = os.path.splitext(uploaded.filename)[1].lower()
    if extension not in ALLOWED_REPORT_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_REPORT_EXTENSIONS))
        return error(f"Unsupported file type. Allowed: {allowed}", status=422)

    uploaded.stream.seek(0, os.SEEK_END)
    size = uploaded.stream.tell()
    uploaded.stream.seek(0)
    if size == 0:
        return error("That file is empty", status=422)
    if size > MAX_REPORT_BYTES:
        return error("Report must be 10 MB or smaller", status=413)

    import secrets

    directory = upload_dir(REPORTS_SUBDIR)
    os.makedirs(directory, exist_ok=True)
    # Random stored name, never the uploader's: keeps the path untraversable
    # and the URL unguessable. The original is kept only as a display label.
    stored = f"{secrets.token_hex(16)}{extension}"
    uploaded.save(os.path.join(directory, stored))

    previous_file = lab_request.report_file
    lab_request.report_file = stored
    lab_request.report_original_name = uploaded.filename[:255]
    lab_request.report_uploaded_at = datetime.utcnow()
    if "result_summary" in request.form:
        lab_request.result_summary = (request.form.get("result_summary") or "").strip()[
            :MAX_SUMMARY
        ] or None
    if lab_request.technician_id is None:
        lab_request.technician_id = _caller_id()
    lab_request.recollection_requested = False
    if lab_request.status != "verified":
        lab_request.status = "completed"

    _system_entry(
        lab_request,
        ("Replaced the report" if previous_file else "Uploaded the report")
        + f" ({uploaded.filename[:120]}) and marked the test completed",
    )

    _notify_counterpart(
        lab_request,
        "Lab report ready",
        f"{lab_request.test_name} for "
        f"{lab_request.patient.name if lab_request.patient else 'a patient'} is ready to review",
    )

    audit(
        LAB_REPORT_UPLOADED,
        entity="lab_request",
        entity_id=lab_request.id,
        detail=f"{lab_request.test_name} report filed",
    )
    db.session.commit()
    dashboard_changed("lab.report_uploaded")

    # The replaced file goes only after the row is safely committed, and a
    # failure to remove it must not fail the request.
    if previous_file and previous_file != stored:
        try:
            os.remove(os.path.join(directory, previous_file))
        except OSError:
            pass

    return success(lab_request.to_dict(), message="Report uploaded")


@lab_bp.post("/requests/<int:request_id>/recollect")
@role_required("admin", "lab_technician")
def request_recollection(request_id):
    """The sample is unusable — haemolysed, insufficient, mislabelled.

    Puts the request back to `ordered`, because that is genuinely where it is:
    waiting for a sample. The reason is recorded and the doctor is told, so
    nobody has to work out why a test that was in progress is suddenly not.
    """
    lab_request = db.session.get(LabRequest, request_id)
    if not lab_request or not _can_view(lab_request):
        return error("Lab request not found", status=404)
    if _is_technician() and lab_request.technician_id not in (_caller_id(), None):
        return error("That test is assigned to another technician", status=403)
    if lab_request.status in ("verified", "cancelled"):
        return error("That lab request is already closed", status=409)

    payload = request.get_json(silent=True) or {}
    reason = _text(payload, "reason", MAX_REASON)
    if not reason:
        return error("Give a reason for the recollection", status=422)

    lab_request.recollection_requested = True
    lab_request.recollection_reason = reason
    lab_request.recollection_at = datetime.utcnow()
    lab_request.status = "ordered"
    if lab_request.technician_id is None:
        lab_request.technician_id = _caller_id()

    _system_entry(lab_request, f"Requested a fresh sample — {reason}")

    _notify_counterpart(
        lab_request,
        "Sample recollection needed",
        f"{lab_request.test_name} for "
        f"{lab_request.patient.name if lab_request.patient else 'a patient'}: {reason}",
    )

    audit(
        LAB_RECOLLECTION,
        entity="lab_request",
        entity_id=lab_request.id,
        detail=f"{lab_request.test_name}: {reason}",
    )
    db.session.commit()
    dashboard_changed("lab.recollection")
    return success(lab_request.to_dict(), message="Recollection requested")


# -------------------------------------------------------------- discussion --


@lab_bp.get("/requests/<int:request_id>/messages")
@role_required(*LAB_ROLES)
def list_messages(request_id):
    """This request's history: what was said, and what happened, in order."""
    lab_request = db.session.get(LabRequest, request_id)
    if not lab_request or not _can_view(lab_request):
        return error("Lab request not found", status=404)
    if not _can_discuss(lab_request):
        return error(
            "Only the requesting doctor and the assigned lab technician can "
            "read this discussion",
            status=403,
        )
    return success({"items": [m.to_dict() for m in lab_request.messages]})


@lab_bp.post("/requests/<int:request_id>/messages")
@role_required(*LAB_ROLES)
def post_message(request_id):
    """Adds a message to this one patient's one test.

    There is no counterpart to this that is not scoped to a request. A
    question about a specimen belongs to the specimen, and a thread that
    outlived its test would be a chat system with a clinical label on it.
    """
    lab_request = db.session.get(LabRequest, request_id)
    if not lab_request or not _can_view(lab_request):
        return error("Lab request not found", status=404)
    if not _can_discuss(lab_request):
        return error(
            "Only the requesting doctor and the assigned lab technician can "
            "post in this discussion",
            status=403,
        )
    if lab_request.status == "cancelled":
        return error("That lab request was cancelled", status=409)

    payload = request.get_json(silent=True) or {}
    body = _text(payload, "body", MAX_MESSAGE)
    if not body:
        return error("A message cannot be empty", status=422)

    message = LabMessage(
        lab_request_id=lab_request.id,
        author_id=_caller_id(),
        kind="message",
        body=body,
    )
    db.session.add(message)

    caller = _caller()
    _notify_counterpart(
        lab_request,
        f"Lab discussion — {lab_request.test_name}",
        f"{caller.name if caller else 'Someone'}: {body[:120]}",
    )

    db.session.flush()
    db.session.commit()
    return success(message.to_dict(), message="Message posted", status=201)
