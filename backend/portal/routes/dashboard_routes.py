from flask import Blueprint
from flask_jwt_extended import jwt_required

from portal.helpers.auth_helper import get_current_doctor, get_current_nurse
from portal.helpers.datetime_helper import local_day_bounds
from portal.helpers.decorators import current_role
from portal.helpers.patient_access import scope_patients
from portal.helpers.queue_helper import scope_appointments
from portal.helpers.response import success
from portal.models.consultation import Consultation
from portal.models.nursing_assignment import NursingAssignment
from portal.models.patient import Patient
from portal.models.report import Report
from portal.routes.appointment_routes import collapse_duplicates, open_appointments_query
from portal.routes.report_routes import scope_reports

dashboard_bp = Blueprint("dashboard", __name__)


def queue_size(query):
    """How many cards the Appointments page will actually draw for this query.

    Not `.count()`: the page collapses a patient's double-registrations into one
    card, and a count taken in SQL would include the rows it hides — the card
    would read "3 OPs" over a queue of two people. The queue is a work list of
    the patients currently in the building, so loading it to count it is a few
    rows, not a table scan.
    """
    return len(collapse_duplicates(query.all()))


@dashboard_bp.get("/summary")
@jwt_required()
def summary():
    # The staff's day, not UTC's — see local_day_bounds. Only the genuinely
    # date-bounded counts below use these; the queue card is not one of them.
    today_start, today_end = local_day_bounds()

    role = current_role()
    doctor = get_current_doctor()

    # Reception's dashboard is the front desk's own work: who is registered and
    # who is in today's queue. It deliberately carries no consultation, report
    # or nursing figures — those are clinical, and the routes behind them
    # return 403 for this role, so a card linking to one would be a dead end.
    if role == "receptionist":
        return success(
            {
                "scope": "front_desk",
                "total_patients": Patient.query.count(),
                "unassigned_patients": Patient.query.filter(
                    Patient.assigned_doctor_id.is_(None)
                ).count(),
                # Counted the same way the Appointments page lists them —
                # double-registrations collapsed — or the card would read one
                # higher than the queue it links to.
                "todays_appointments": queue_size(open_appointments_query()),
                "todays_registrations": Patient.query.filter(
                    Patient.created_at >= today_start, Patient.created_at <= today_end
                ).count(),
            }
        )

    # A nurse's numbers live on /api/nursing/summary, which is scoped to their
    # own assignments. Returning hospital-wide counts here would contradict it.
    if role == "nurse":
        nurse = get_current_nurse()
        active = NursingAssignment.query.filter_by(status="active")
        if nurse:
            active = active.filter(NursingAssignment.nurse_id == nurse.id)
        return success({"scope": "nursing", "active_assignments": active.count()})

    # A doctor's dashboard should only reflect their own department/work —
    # not every other doctor's patients — same scoping rule as Appointments.
    # Admin accounts (no doctor profile) still see the hospital-wide view.
    # Each card's query mirrors the filter its link applies on the target
    # page, so the number and the rows behind it can't disagree.
    appointments_query = open_appointments_query()
    consultations_query = Consultation.query.filter_by(status="in_progress")
    recent_query = Consultation.query.order_by(Consultation.created_at.desc())
    # Both kinds of report count here — a single session's and a whole course
    # of treatment's — scoped by the same helper the Reports page uses, so the
    # card and the list it links to can't disagree.
    reports_query = scope_reports(Report.query, doctor)
    nursing_query = NursingAssignment.query.filter_by(status="active")

    if doctor:
        # The same helper list_appointments uses, not a second copy of the
        # rule: this count links straight to that page, so anything it decides
        # differently shows up as a card reading one number over a list of
        # another.
        appointments_query = scope_appointments(appointments_query, doctor)
        consultations_query = consultations_query.filter(Consultation.doctor_id == doctor.id)
        recent_query = recent_query.filter(Consultation.doctor_id == doctor.id)
        nursing_query = nursing_query.filter(NursingAssignment.doctor_id == doctor.id)

    todays_reports_query = reports_query.filter(
        Report.generated_at >= today_start, Report.generated_at <= today_end
    )

    # A doctor's patient count is their own list, matching what the Patients
    # page shows them — a hospital-wide number they can't click through to
    # would be worse than useless.
    patients_query = scope_patients(Patient.query, doctor)

    return success(
        {
            "scope": "clinical",
            "todays_appointments": queue_size(appointments_query),
            "active_consultations": consultations_query.count(),
            "total_patients": patients_query.count(),
            "reports_generated": reports_query.count(),
            "todays_reports": todays_reports_query.count(),
            "nursing_assignments": nursing_query.count(),
            "recent_consultations": [c.to_dict() for c in recent_query.limit(10).all()],
        }
    )
