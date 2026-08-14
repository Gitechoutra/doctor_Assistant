"""The numbers on each role's home screen.

Two dashboards, one endpoint, and every count derived from the same helpers
the page it links to uses. That is the rule this module exists to keep: a card
reading "4 waiting" over a queue with three people in it is worse than no card
at all, and the only way to guarantee it cannot happen is for the count and
the list to come from one query.

The PA's dashboard is the practice's day: who is booked, who is here, who has
been seen. The doctor's is their own clinical work. They overlap deliberately
-- both show the queue, because both are working from it.
"""

from flask import Blueprint
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.datetime_helper import local_day_bounds
from portal.helpers.decorators import current_role
from portal.helpers.patient_access import scope_patients
from portal.helpers.practice import practice_doctor
from portal.helpers.queue_helper import (
    collapse_duplicates,
    number_queue,
    queue_query,
    scope_appointments,
    upcoming_query,
)
from portal.helpers.response import success
from portal.models.appointment import Appointment
from portal.models.consultation import Consultation
from portal.models.patient import Patient
from portal.models.report import Report
from portal.routes.report_routes import scope_reports

dashboard_bp = Blueprint("dashboard", __name__)

# How many rows the "recent" lists carry. Enough to be a glance, few enough
# that the dashboard is one request and not a page load.
RECENT_LIMIT = 8


def _queue_payload(doctor):
    """Today's queue, numbered, exactly as /appointments/queue returns it.

    Sent with the dashboard rather than fetched separately: the queue *is* the
    dashboard's centrepiece for both roles, and making the home screen wait on
    a second round trip to draw its main panel is a visible stutter for no
    benefit.
    """
    numbered = number_queue(collapse_duplicates(queue_query(doctor).all()))
    return [a.to_dict(queue_number=n) for a, n in numbered]


@dashboard_bp.get("/summary")
@jwt_required()
def summary():
    day_start, day_end = local_day_bounds()
    doctor = get_current_doctor()
    role = current_role()

    queue = _queue_payload(doctor)
    # Derived from the payload rather than counted again in SQL, so the number
    # on the card is literally the length of the list under it.
    waiting = sum(1 for a in queue if a["status"] == "waiting")
    in_consultation = sum(1 for a in queue if a["status"] == "in_progress")

    todays_completed = scope_appointments(
        Appointment.query.filter(
            Appointment.status == "completed",
            Appointment.arrived_at >= day_start,
            Appointment.arrived_at <= day_end,
        ),
        doctor,
    ).count()

    upcoming = upcoming_query(doctor).limit(RECENT_LIMIT).all()
    upcoming_total = upcoming_query(doctor).count()

    patients_query = scope_patients(Patient.query, doctor)
    recent_patients = (
        patients_query.order_by(Patient.created_at.desc()).limit(RECENT_LIMIT).all()
    )

    shared = {
        "role": role,
        "doctor": (practice_doctor().to_dict() if practice_doctor() else None),
        # Today, at a glance. Same four numbers on both dashboards because both
        # roles are working the same day from opposite ends of it.
        "todays_appointments": len(queue),
        "waiting": waiting,
        "in_consultation": in_consultation,
        "todays_completed": todays_completed,
        "upcoming_total": upcoming_total,
        "total_patients": patients_query.count(),
        "todays_registrations": patients_query.filter(
            Patient.created_at >= day_start, Patient.created_at <= day_end
        ).count(),
        "queue": queue,
        "upcoming": [a.to_dict() for a in upcoming],
    }

    if doctor is None:
        # The PA's view. No clinical figures — those are the doctor's work, and
        # a card the PA could not click through to would be a dead end.
        shared["scope"] = "front_desk"
        shared["recent_patients"] = [p.to_dict() for p in recent_patients]
        return success(shared)

    # The doctor's view: their own clinical work on top of the shared day.
    reports_query = scope_reports(Report.query, doctor)
    recent_consultations = (
        Consultation.query.filter(Consultation.doctor_id == doctor.id)
        .order_by(Consultation.created_at.desc())
        .limit(RECENT_LIMIT)
        .all()
    )

    shared.update(
        {
            "scope": "clinical",
            "active_consultations": Consultation.query.filter(
                Consultation.doctor_id == doctor.id,
                Consultation.status == "in_progress",
            ).count(),
            "reports_generated": reports_query.count(),
            "todays_reports": reports_query.filter(
                Report.generated_at >= day_start, Report.generated_at <= day_end
            ).count(),
            "consultations_total": Consultation.query.filter(
                Consultation.doctor_id == doctor.id
            ).count(),
            "pending_prescriptions": Consultation.query.filter(
                Consultation.doctor_id == doctor.id,
                Consultation.status == "completed",
                Consultation.prescription_verified_at.is_(None),
                # Only sessions that actually produced a prescription. A visit
                # with nothing to sign is not outstanding work.
                Consultation.prescriptions.any(),
            ).count(),
            "recent_consultations": [c.to_dict() for c in recent_consultations],
            "recent_patients": [p.to_dict() for p in recent_patients],
        }
    )
    return success(shared)


@dashboard_bp.get("/activity")
@jwt_required()
def activity():
    """The practice's recent movement, for whoever wants a fuller feed than the
    summary's eight rows."""
    doctor = get_current_doctor()
    consultations = Consultation.query
    if doctor:
        consultations = consultations.filter(Consultation.doctor_id == doctor.id)

    return success(
        {
            "consultations": [
                c.to_dict(include_summary=True)
                for c in consultations.order_by(Consultation.created_at.desc())
                .limit(20)
                .all()
            ],
            "appointments": [
                a.to_dict()
                for a in scope_appointments(Appointment.query, doctor)
                .order_by(db.func.coalesce(Appointment.arrived_at, Appointment.created_at).desc())
                .limit(20)
                .all()
            ],
        }
    )
