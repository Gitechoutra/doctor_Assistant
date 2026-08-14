import os

from flask import Blueprint, request, send_file
from flask_jwt_extended import get_jwt_identity

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import clinical_only
from portal.helpers.notify import notify
from portal.helpers.response import error, success
from portal.models.consultation import Consultation
from portal.models.patient_case import PatientCase
from portal.models.report import Report
from portal.pdf.case_report_generator import generate_case_pdf
from portal.pdf.report_generator import generate_consultation_pdf

report_bp = Blueprint("reports", __name__)

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "reports")


def _can_access(owner):
    """`owner` is the consultation or the case the report covers — both carry
    a doctor_id, and the rule is the same for either.

    A doctor may only touch their own patients' reports; admin (no doctor
    profile) can see and generate across the whole hospital — same access
    pattern as the consultation room itself.
    """
    doctor = get_current_doctor()
    return doctor is None or (owner is not None and doctor.id == owner.doctor_id)


def scope_reports(query, doctor):
    """Narrows a Report query to one doctor's own reports, or leaves it alone
    for admin.

    A report hangs off either a consultation or a case, so the filter has to
    reach through whichever one it has — outer joins plus an OR rather than
    two queries, so the result stays a single ordered list. Shared with the
    dashboard's report count, which has to agree with the rows this page
    shows or the card links to a different number than it displays.
    """
    if not doctor:
        return query
    return (
        query.outerjoin(Consultation, Report.consultation_id == Consultation.id)
        .outerjoin(PatientCase, Report.case_id == PatientCase.id)
        .filter(
            db.or_(
                Consultation.doctor_id == doctor.id,
                PatientCase.doctor_id == doctor.id,
            )
        )
    )


@report_bp.get("")
@clinical_only
def list_reports():
    query = scope_reports(Report.query, get_current_doctor())
    reports = query.order_by(Report.generated_at.desc()).all()
    return success([r.to_dict() for r in reports])


@report_bp.post("")
@clinical_only
def generate_report():
    """Generates a PDF for one session (`consultation_id`) or a whole course
    of treatment (`case_id`).

    Both kinds are gated on a doctor's sign-off of the medicines they carry.
    The PDF is the document that leaves the hospital, so it must not be
    printable until someone has stood behind what it prescribes.
    """
    payload = request.get_json(silent=True) or {}
    consultation_id = payload.get("consultation_id")
    case_id = payload.get("case_id")

    if bool(consultation_id) == bool(case_id):
        return error("Provide exactly one of consultation_id or case_id", status=422)

    if case_id:
        return _generate_case_report(case_id)
    return _generate_consultation_report(consultation_id)


def _write_report(lookup_kwargs, filename):
    """Records the generated file against its consultation or case.

    Overwrites in place: regenerating always reflects the current prescription
    and signature, and a consultation or case is only ever allowed one report.
    """
    report = Report.query.filter_by(**lookup_kwargs).first()
    if not report:
        report = Report(file_path=filename, **lookup_kwargs)
        db.session.add(report)
    else:
        report.file_path = filename
    return report


def _notify_owning_doctor(owner, title, body):
    """Tells the owning doctor their report exists when someone else (admin)
    generated it; notify() drops the case where they did it themselves."""
    owning_doctor_user_id = owner.doctor.user_id if owner.doctor else None
    if not owning_doctor_user_id:
        return
    notify(
        [owning_doctor_user_id],
        title=title,
        body=body,
        category="report",
        link="/dashboard/reports",
        exclude_user_id=get_jwt_identity(),
    )


def _generate_consultation_report(consultation_id):
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Consultation not found", status=404)
    if consultation.status != "completed" or not consultation.summary:
        return error("Report can only be generated after the consultation is completed", status=422)
    if not _can_access(consultation):
        return error("You don't have access to this consultation", status=403)
    if not consultation.prescription_verified_at:
        return error("Verify the prescription before generating the report", status=409)

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    filename = f"consultation_{consultation.id}.pdf"

    try:
        generate_consultation_pdf(consultation, os.path.join(UPLOADS_DIR, filename))
    except Exception as exc:  # noqa: BLE001 - surface PDF generation failure
        return error(f"Could not generate PDF: {exc}", status=500)

    report = _write_report({"consultation_id": consultation.id}, filename)
    patient_name = consultation.patient.name if consultation.patient else "a patient"
    _notify_owning_doctor(
        consultation,
        "Report ready",
        f"The consultation report for {patient_name} has been generated.",
    )

    db.session.commit()
    dashboard_changed("report_generated")

    return success(report.to_dict(), message="Report generated", status=201)


def _generate_case_report(case_id):
    case = PatientCase.query.get(case_id)
    if not case:
        return error("Case not found", status=404)
    if not _can_access(case):
        return error("You don't have access to this case", status=403)
    if case.status != "closed" or not case.is_consolidated:
        return error(
            "Close the case first — the consolidated report covers a finished course of treatment",
            status=422,
        )
    if not case.final_verified_at:
        return error("Verify the final prescription before generating the report", status=409)

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    filename = f"case_{case.id}.pdf"

    try:
        generate_case_pdf(case, os.path.join(UPLOADS_DIR, filename))
    except Exception as exc:  # noqa: BLE001 - surface PDF generation failure
        return error(f"Could not generate PDF: {exc}", status=500)

    report = _write_report({"case_id": case.id}, filename)
    patient_name = case.patient.name if case.patient else "a patient"
    _notify_owning_doctor(
        case,
        "Consolidated report ready",
        f"The full medical report for {patient_name}'s course of treatment has been generated.",
    )

    db.session.commit()
    dashboard_changed("report_generated")

    return success(report.to_dict(), message="Consolidated report generated", status=201)


@report_bp.get("/<int:report_id>/download")
@clinical_only
def download_report(report_id):
    report = Report.query.get(report_id)
    if not report:
        return error("Report not found", status=404)

    owner = report.case or report.consultation
    if not _can_access(owner):
        return error("You don't have access to this report", status=403)

    file_path = os.path.join(UPLOADS_DIR, report.file_path)
    if not os.path.exists(file_path):
        return error("Report file is missing on the server", status=404)

    patient_name = (owner.patient.name if owner and owner.patient else "patient").replace(" ", "_")
    suffix = "full_medical_report" if report.case_id else "consultation_report"
    return send_file(file_path, as_attachment=True, download_name=f"{patient_name}_{suffix}.pdf")
