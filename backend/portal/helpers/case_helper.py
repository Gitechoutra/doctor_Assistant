"""Putting each consultation session into a course of treatment.

There are two ways a consultation starts — picked up from the appointment
queue, or started directly for a patient (which is how a doctor begins the
next session of a case) — and both must land in the same place: a session
numbered inside one open `PatientCase`. Doing that in one helper is what keeps
the two paths from disagreeing about which case a session belongs to.

The rule the module exists to enforce: starting a session never touches an
earlier one. A new consultation row is always created, and joining a case only
ever appends to it.

Callers add to the open session; the caller commits, so the case and the
consultation land together or not at all.
"""

from datetime import datetime

from portal.extensions import db
from portal.models.patient_case import PatientCase


def open_case_for(patient_id, doctor_id):
    """The patient's open case with this doctor, or None.

    Scoped to the doctor as well as the patient because a case is one doctor's
    course of treatment: a patient seen by two doctors has two cases, and a
    session must never be appended to the other doctor's.
    """
    return (
        PatientCase.query.filter_by(
            patient_id=patient_id, doctor_id=doctor_id, status="open"
        )
        .order_by(PatientCase.id.desc())
        .first()
    )


def case_for_new_session(patient_id, doctor_id, reason=None):
    """The case a session starting now belongs to, creating one if needed.

    A returning patient continues their open case, which is what makes the
    second consultation a second *session* rather than an unrelated visit. A
    patient with no open case (first visit, or their last case was closed and
    reported) gets a fresh one.
    """
    case = open_case_for(patient_id, doctor_id)
    if case:
        # The first stated reason is what the case is named after; a later
        # session's reason would relabel a case mid-treatment.
        if not case.reason and reason:
            case.reason = reason[:255]
        return case

    case = PatientCase(
        patient_id=patient_id,
        doctor_id=doctor_id,
        status="open",
        reason=(reason or None) and reason[:255],
        opened_at=datetime.utcnow(),
    )
    db.session.add(case)
    db.session.flush()  # assigns case.id before the consultation links to it
    return case


def todays_session(case):
    """The session of this case that was started today, if there is one.

    A visit is a day, so this is what tells a second consultation request
    apart: the patient is still here (continue the session that exists) or
    they have come back another day (open a new one). At most one can match,
    because finding one is what stops a second being created.
    """
    if not case:
        return None
    return next((s for s in case.sessions if s.is_from_today), None)


def next_session_number(case):
    """1 for the first session, then one past the highest so far.

    Derived from the maximum rather than the count so a number is never
    reused if a session is ever removed — a printed report's "Session 2" has
    to keep meaning the same visit.
    """
    numbers = [s.session_number for s in case.sessions if s.session_number]
    return (max(numbers) + 1) if numbers else 1


def attach_to_case(consultation, case):
    """Makes a freshly created consultation the case's next session."""
    consultation.case_id = case.id
    consultation.session_number = next_session_number(case)
    return consultation


def session_context(consultation):
    """One completed session, flattened for the AI prompts.

    The same shape feeds two things — the background handed to a follow-up
    session's summary, and the material consolidated when the case closes — so
    it is built once here rather than assembled differently in each route.
    """
    summary = consultation.summary
    return {
        "session_number": consultation.session_number,
        "date": (
            (consultation.ended_at or consultation.started_at).strftime("%d %b %Y, %H:%M")
            if (consultation.ended_at or consultation.started_at)
            else None
        ),
        "summary": summary.summary if summary else None,
        "symptoms": summary.symptoms if summary else None,
        "possible_diagnosis": summary.possible_diagnosis if summary else None,
        "follow_up_advice": (summary.follow_up_advice or "").splitlines() if summary else [],
        "lifestyle_advice": (summary.lifestyle_advice or "").splitlines() if summary else [],
        "prescriptions": [
            {
                "medicine_name": p.medicine_name,
                "dose": p.dose,
                "frequency": p.frequency,
                "duration": p.duration,
            }
            for p in consultation.prescriptions
        ],
    }


def prior_session_context(consultation):
    """The completed sessions of this case that came before `consultation`."""
    case = consultation.case
    if not case:
        return []
    earlier = [
        s
        for s in case.sessions
        if s.id != consultation.id
        and s.status == "completed"
        and (s.session_number or 0) < (consultation.session_number or 0)
    ]
    earlier.sort(key=lambda s: s.session_number or 0)
    return [session_context(s) for s in earlier]
