"""The day's queue: putting a patient into it, ordering it, and keeping it in
step with consultation state.

This is the join between the two people who use this system. The PA books and
checks patients in; the doctor calls them through. Both are looking at the
same rows, so the rules that decide what the queue says live here once rather
than in each route that renders it.

Three things this module exists to guarantee:

  * **one definition of "in the queue".** `queue_query` is it. The PA's queue
    board, the doctor's queue, and both dashboards' counts all read it, so a
    card cannot say one number over a list of another.
  * **the queue is numbered, and the numbers are positions.** `number_queue`
    assigns 0 to the patient currently with the doctor and 1..n to those
    waiting, in arrival order. Not decoration: the PA reads these numbers out
    loud, and a patient told "you are third" has to still be third when the
    board is refreshed.
  * **a finished patient leaves the queue.** Two things can strand one, so
    both are handled here rather than in one route: a consultation started
    from the queue, and a consultation started from the patient's record
    while they are also queued. `claim_appointment_for` covers both, and
    `complete_appointment_for` closes whichever row ended up linked.

Callers add to the open session; the caller commits, so the queue move and the
consultation change land together or not at all.
"""

from datetime import datetime, timedelta

from portal.extensions import db
from portal.helpers.audit import APPOINTMENT_CREATED, audit
from portal.helpers.datetime_helper import local_day_bounds
from portal.helpers.notify import notify
from portal.helpers.practice import practice_doctor
from portal.helpers.response import error
from portal.models.appointment import OPEN_STATUSES, QUEUE_STATUSES, Appointment
from portal.models.patient import Patient

# How close together two appointments for the same patient have to be before
# the second is treated as a double-booking rather than a second visit.
#
# Nobody arrives, is seen, leaves and comes back inside ten minutes. What does
# happen is the desk pressing the button twice -- and every one of those
# becomes its own card in the doctor's queue, with the same patient, the same
# name, the same ID and only the clock to tell them apart. The doctor then has
# to guess which one to call.
DUPLICATE_WINDOW_MINUTES = 10


def recent_duplicate_for(patient_id, within_minutes=DUPLICATE_WINDOW_MINUTES, now=None):
    """The patient's own appointment raised in the last few minutes, if any.

    Cancelled rows are deliberately not counted. Cancelling is how the desk
    undoes something it got wrong, and treating the row it just withdrew as a
    duplicate would leave it unable to raise the corrected one for ten
    minutes. A completed row *is* counted: the patient has already been seen,
    so a second appointment that soon is a double-booking of the same visit.
    """
    cutoff = (now or datetime.utcnow()) - timedelta(minutes=within_minutes)
    return (
        Appointment.query.filter(
            Appointment.patient_id == patient_id,
            Appointment.status != "cancelled",
            Appointment.created_at >= cutoff,
        )
        .order_by(Appointment.created_at.desc())
        .first()
    )


def book_appointment(
    patient,
    *,
    reason=None,
    scheduled_at=None,
    walk_in=False,
    notes=None,
    actor_user_id=None,
    now=None,
):
    """Books `patient` in with the practice's doctor.

    Returns (appointment, failure). `failure` is a ready-made error response
    when the appointment cannot be booked, and the caller returns it unchanged.

    `walk_in=True` means the patient is at the desk right now: the appointment
    is created already checked in, so it joins today's queue immediately.
    Otherwise it is `scheduled` and joins the queue when the PA checks them in
    on the day -- which is what separates "booked for Thursday" from "here".

    Adds to the open session and does not commit, so the appointment lands in
    the same transaction as whatever raised it -- a patient registered with an
    appointment is both or neither, never a patient nobody queued.
    """
    # Whoever the patient is assigned to, so the appointment lands in that
    # doctor's queue rather than in whichever one the practice resolves to.
    # Registration stamps `assigned_doctor_id` on every patient, so this is
    # normally the answer; `practice_doctor` remains the fallback for a
    # patient on file from before there was a doctor to assign. In a
    # single-doctor practice the two are the same row, which is why this can
    # change without anything else moving.
    doctor = patient.assigned_doctor or practice_doctor()
    if not doctor:
        return None, error(
            "No doctor has been set up for this practice yet, so there is no "
            "one to book with.",
            status=409,
        )

    now = now or datetime.utcnow()

    duplicate = recent_duplicate_for(patient.id, now=now)
    if duplicate:
        minutes = max(1, int((now - duplicate.created_at).total_seconds() // 60))
        return None, error(
            f"{patient.name} was already booked {minutes} minute"
            f"{'' if minutes == 1 else 's'} ago and is still on today's list. Use "
            "that appointment rather than raising a second one — cancel it first "
            "if it was raised in error.",
            status=409,
            # The row to look at, so the desk can be sent straight to it
            # instead of being told to go and find it.
            errors={"appointment_id": duplicate.id, "status": duplicate.status},
        )

    appointment = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        reason=reason or None,
        notes=notes or None,
        scheduled_at=scheduled_at,
        status="waiting" if walk_in else "scheduled",
        arrived_at=now if walk_in else None,
    )
    db.session.add(appointment)

    if walk_in:
        patient.last_registered_at = now
        if doctor.user_id:
            notify(
                [doctor.user_id],
                title="New patient in your queue",
                body=f"{patient.name} is waiting to be seen.",
                category="appointment",
                link="/dashboard/queue",
                exclude_user_id=actor_user_id,
            )

    db.session.flush()  # assigns appointment.id for the audit row
    when = "waiting now" if walk_in else (
        scheduled_at.strftime("%d %b %Y, %H:%M") if scheduled_at else "unscheduled"
    )
    audit(
        APPOINTMENT_CREATED,
        entity="appointment",
        entity_id=appointment.id,
        detail=f"{patient.name} booked ({when})",
    )
    return appointment, None


def add_to_todays_queue(patient, *, reason=None, notes=None, actor_user_id=None, now=None):
    """Puts `patient` into today's queue, however they need to get there —
    and never twice.

    This is the general form of "the desk has this patient in front of them
    right now," tried in the order they could actually be found in:

      1. **Already on today's queue** (waiting, or with the doctor). Returned
         as-is, nothing written — pressing this again cannot double-book them
         or move their place in the line.
      2. **Booked for today and not yet checked in.** Checked in, exactly as
         the appointment book's own check-in button would do it.
      3. **Neither.** A fresh walk-in, exactly as ticking "Is the patient
         here?" at registration does.

    Registration's own walk-in path (`patient_routes.create_patient`) and the
    appointment book's check-in button already cover the first patient to
    arrive and a patient who booked ahead; this exists for the third case
    neither reaches — someone registered earlier with no booking at all (a
    phone call logged as a patient with nothing raised for them yet), now
    standing at the desk. Built entirely from the same three primitives
    `queue_query`, `check_in` and `book_appointment` rather than a second copy
    of any of their rules, so a patient can never end up queued one way here
    and another way anywhere else in the app.

    Returns (appointment, outcome, failure). `outcome` is `"existing"`,
    `"checked_in"` or `"created"` — what actually happened, since all three
    return an appointment and no failure on success and the caller has to
    tell the desk which one it was.
    """
    now = now or datetime.utcnow()
    doctor = practice_doctor()

    already_queued = queue_query(doctor).filter(Appointment.patient_id == patient.id).first()
    if already_queued:
        return already_queued, "existing", None

    day_start, day_end = local_day_bounds()
    scheduled_today = (
        Appointment.query.filter(
            Appointment.patient_id == patient.id,
            Appointment.status == "scheduled",
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at <= day_end,
        )
        .order_by(Appointment.scheduled_at.asc())
        .first()
    )
    if scheduled_today:
        check_in(scheduled_today, actor_user_id=actor_user_id, now=now)
        return scheduled_today, "checked_in", None

    appointment, failure = book_appointment(
        patient,
        reason=reason,
        notes=notes,
        walk_in=True,
        actor_user_id=actor_user_id,
        now=now,
    )
    return appointment, "created", failure


def check_in(appointment, *, actor_user_id=None, now=None):
    """The booked patient has arrived. Puts them in today's queue."""
    now = now or datetime.utcnow()
    if not appointment.check_in(now=now):
        return False
    if appointment.patient:
        appointment.patient.last_registered_at = now
    doctor = appointment.doctor
    if doctor and doctor.user_id and appointment.patient:
        notify(
            [doctor.user_id],
            title="Patient has arrived",
            body=f"{appointment.patient.name} is waiting to be seen.",
            category="appointment",
            link="/dashboard/queue",
            exclude_user_id=actor_user_id,
        )
    return True


# --------------------------------------------------------------------------
# reading the queue
# --------------------------------------------------------------------------


def queue_query(doctor=None):
    """Today's queue: everyone who is here and not yet finished.

    Ordered the way the room works — the patient currently with the doctor
    first, then those waiting in the order they arrived. That ordering is what
    makes `number_queue` below able to hand out positions without a second
    opinion about who is next.

    Waiting patients are bounded to today. A `waiting` row left over from
    yesterday is somebody the desk forgot to close, and carrying it into this
    morning's queue would put a patient who is not in the building at the head
    of the line.

    **A consultation that is under way is not bounded by anything.** The day
    filter used to apply to `in_progress` rows too, which meant a consultation
    still running after midnight — or one opened on a previous day and never
    ended — dropped out of the queue while it was still open. Everything
    downstream then disagreed with itself: the board went empty, the "Active
    consultations" count fell to zero, and the Appointments page kept listing
    the patient as In Consultation, because the book is not day-bounded. An
    in-progress row is by definition somebody the doctor still has open, so
    the only honest thing the queue can do is keep showing them until it is
    closed. `arrived_at` is also allowed to be NULL here for the same reason:
    a patient called straight in has no arrival time, and their consultation
    is no less open for it.
    """
    day_start, day_end = local_day_bounds()
    query = Appointment.query.filter(
        Appointment.status.in_(QUEUE_STATUSES),
        db.or_(
            Appointment.status == "in_progress",
            db.and_(
                Appointment.arrived_at >= day_start,
                Appointment.arrived_at <= day_end,
            ),
        ),
    )
    if doctor:
        query = query.filter(Appointment.doctor_id == doctor.id)
    return query.order_by(
        # 'in_progress' sorts before 'waiting' alphabetically, which happens to
        # be the order we want — but relying on that would be a trap for
        # whoever renames a status, so it is spelled out.
        db.case((Appointment.status == "in_progress", 0), else_=1),
        Appointment.arrived_at.asc(),
        Appointment.id.asc(),
    )


def upcoming_query(doctor=None):
    """Appointments booked for a time that has not come yet."""
    query = Appointment.query.filter(Appointment.status == "scheduled")
    if doctor:
        query = query.filter(Appointment.doctor_id == doctor.id)
    return query.order_by(
        # Unscheduled bookings last: they have no time to sort by, and putting
        # NULL first would head the list with the least specific rows.
        Appointment.scheduled_at.is_(None).asc(),
        Appointment.scheduled_at.asc(),
        Appointment.id.asc(),
    )


def collapse_duplicates(appointments):
    """One card per patient, keeping the furthest along.

    A patient booked twice by mistake is one person standing in the room, and
    drawing them twice makes the doctor guess which card to open. The rows
    stay in the database — cancelling one is the desk's call, not this
    function's — they are just not drawn twice.

    Input order is preserved, and `queue_query` already sorts in-progress
    first, so the row kept for a patient who is with the doctor is the one
    that says so.
    """
    seen = set()
    kept = []
    for appointment in appointments:
        if appointment.patient_id in seen:
            continue
        seen.add(appointment.patient_id)
        kept.append(appointment)
    return kept


def number_queue(appointments):
    """Pairs each appointment with its position, as the UI shows it.

    Returns [(appointment, number)]. **0 is the patient currently with the
    doctor**; waiting patients are 1, 2, 3 … in arrival order. So the board
    reads

        NOW CONSULTING   Anita Rao
        NEXT
          1. Vikram Shah
          2. Priya Menon

    and the number the PA reads out is the number the patient counts down.
    Positions are derived on every read rather than stored, because they move:
    a cancellation two places ahead should make everybody behind it move up.
    """
    numbered = []
    position = 0
    for appointment in appointments:
        if appointment.status == "in_progress":
            numbered.append((appointment, 0))
        else:
            position += 1
            numbered.append((appointment, position))
    return numbered


def queue_size(doctor=None):
    """How many cards the queue board will actually draw — duplicates
    collapsed, so the dashboard count and the list agree."""
    return len(collapse_duplicates(queue_query(doctor).all()))


# --------------------------------------------------------------------------
# keeping the queue in step with consultations
# --------------------------------------------------------------------------


def claim_appointment_for(consultation, doctor, create_if_missing=True):
    """Gives a starting consultation an appointment row to move through.

    Without this, a doctor who starts a consultation straight from the
    patient's record leaves that patient's queue entry stranded on "waiting"
    forever — nothing links it back, so nothing ever completes it. And a
    patient who was never queued at all would have an in-progress consultation
    that appears nowhere in the queue, so "in consultation" and the active
    count would disagree.

    Every in-progress consultation therefore has exactly one appointment.
    Returns it (or None if there was none to claim and creation was off).
    """
    already_linked = Appointment.query.filter_by(consultation_id=consultation.id).first()
    if already_linked:
        return already_linked

    appointment = (
        Appointment.query.filter(
            Appointment.patient_id == consultation.patient_id,
            Appointment.consultation_id.is_(None),
            Appointment.status.in_(OPEN_STATUSES),
        )
        # Oldest first: if somehow booked twice, the one they've waited on
        # longest.
        .order_by(Appointment.created_at.asc())
        .first()
    )

    if not appointment:
        if not create_if_missing or not doctor:
            return None
        # Walk-in seen without ever joining the queue. Record it so the visit
        # still shows as in-consultation and completes like any other.
        appointment = Appointment(
            patient_id=consultation.patient_id,
            doctor_id=doctor.id,
            reason="Walk-in consultation",
        )
        db.session.add(appointment)

    appointment.consultation_id = consultation.id
    appointment.status = "in_progress"
    # A patient called straight in from a booking never passed through the
    # desk's check-in, so they have no arrival time — and `queue_query` filters
    # on it, which would drop them out of the very queue they are at the head
    # of. Stamped here so the board keeps showing them.
    if appointment.arrived_at is None:
        appointment.arrived_at = datetime.utcnow()
    if doctor:
        appointment.doctor_id = doctor.id
    return appointment


def complete_appointment_for(consultation):
    """Marks the consultation's appointments completed, which is what drops
    the patient out of the queue. Returns the first, or None.

    Every appointment linked to the consultation is moved, not just one: a
    patient booked a second time for a visit already under way has two rows
    pointing at the same session, and leaving either behind is what strands a
    finished patient in the queue.
    """
    appointments = Appointment.query.filter_by(consultation_id=consultation.id).all()
    for appointment in appointments:
        appointment.status = "completed"
    return appointments[0] if appointments else None


def reopen_appointment_for(consultation):
    """Puts the patient back in the queue as in-consultation.

    The mirror of `complete_appointment_for`, for when a doctor continues a
    consultation they had just ended because the patient is still in the room.
    Without it the queue would show the patient as finished while the session
    is running. Returns the first, or None.
    """
    appointments = Appointment.query.filter_by(consultation_id=consultation.id).all()
    for appointment in appointments:
        appointment.status = "in_progress"
        if appointment.arrived_at is None:
            appointment.arrived_at = datetime.utcnow()
    return appointments[0] if appointments else None


def scope_appointments(query, doctor):
    """Narrows an appointment query to what `doctor` may see. No-op for the PA,
    who runs the desk and sees the practice's whole book."""
    if not doctor:
        return query
    return query.filter(Appointment.doctor_id == doctor.id)
