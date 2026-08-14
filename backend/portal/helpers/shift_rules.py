"""When two shifts collide.

One definition, because there are two writers. `routes/shift_routes` refuses a
double-booking an administrator asks for; `seeders/seed_shifts` has to avoid
creating one in the first place. A seeder that wrote rows the API considers
invalid would leave the database in a state the application could not have
produced and cannot repair -- the first edit to such a shift is refused, and
nothing on the screen explains why.

Times are wall-clock local and a night shift is stored with an end earlier
than its start (22:00 -> 06:00) rather than as two rows, which is the whole
reason this needs to be more than `a.start < b.end`.
"""

from datetime import timedelta

from portal.models.staff_shift import StaffShift


def minutes(t):
    """A time as minutes from midnight."""
    return t.hour * 60 + t.minute


def overlaps(a_start, a_end, b_start, b_end):
    """Whether two same-day shifts collide, treating an end at or before the
    start as running into the next morning.

    Touching ends do not overlap: a night shift ending at 06:00 and a morning
    starting at 06:00 are a handover, not a double-booking.
    """
    a0, a1 = minutes(a_start), minutes(a_end)
    b0, b1 = minutes(b_start), minutes(b_end)
    if a1 <= a0:
        a1 += 24 * 60
    if b1 <= b0:
        b1 += 24 * 60
    return a0 < b1 and b0 < a1


def clashing_shift(user_id, shift_date, starts_at, ends_at, exclude_id=None):
    """An existing scheduled shift for this person that overlaps the new one.

    Double-booking a nurse is the mistake the table exists to prevent, so it
    is checked on write rather than left for someone to notice on the ward.
    The day before is examined too: a night shift on it can run into this one.
    """
    if not user_id:
        return None

    query = StaffShift.query.filter(
        StaffShift.user_id == user_id,
        StaffShift.status == "scheduled",
        StaffShift.shift_date.in_([shift_date, shift_date - timedelta(days=1)]),
    )
    if exclude_id:
        query = query.filter(StaffShift.id != exclude_id)

    for other in query.all():
        if other.shift_date == shift_date:
            if overlaps(starts_at, ends_at, other.starts_at, other.ends_at):
                return other
        # The day before only collides if it spills past midnight into this
        # shift's morning.
        elif other.crosses_midnight and minutes(other.ends_at) > minutes(starts_at):
            return other
    return None
