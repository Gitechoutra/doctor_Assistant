from datetime import datetime, time, timedelta


# ---------------------------------------------------------------------------
# Two clocks, and which column is on which.
#
# Almost every timestamp here is UTC: `created_at` comes from db.func.now(),
# and anything written with `datetime.utcnow()` (arrived_at, ended_at, the
# audit trail) matches it. `to_utc_iso` is for those.
#
# `scheduled_at` is the exception, deliberately. It arrives from a
# `datetime-local` field as the wall-clock time the desk typed, is compared
# against `datetime.now()` when it is booked (see
# `appointment_routes._reject_past`), and is stored unshifted. So it is local,
# and the helpers below are what read it back without moving it.
# ---------------------------------------------------------------------------


def to_utc_iso(dt):
    """Serializes a naive UTC datetime (as stored by db.func.now()/utcnow()) with an
    explicit 'Z' suffix so JS `new Date(...)` parses it as UTC instead of local time."""
    if dt is None:
        return None
    return dt.isoformat() + "Z"


def to_local_iso(dt):
    """Serializes a naive *local* wall-clock datetime with no zone suffix, so
    JS `new Date(...)` reads it back on the clock it was typed on.

    For `scheduled_at`, and only for it. Passing that column through
    `to_utc_iso` stamps a 'Z' onto a reading that was never UTC, and the
    browser then shifts it by the practice's offset -- a 09:00 booking renders
    as 14:30 on an IST desk, and the reschedule form pre-fills 14:30 with it.
    """
    if dt is None:
        return None
    return dt.isoformat()


def local_utc_offset():
    """How far the practice's clock runs ahead of UTC (+5:30 on an IST server).

    Read from the machine rather than hard-coded: the same code has to be
    right on a UTC server, where this is zero and every helper below becomes
    a no-op.
    """
    return datetime.now().astimezone().utcoffset() or timedelta(0)


def local_bounds_for(local_date):
    """First and last instant of one local calendar date, as the naive UTC
    that every timestamp column stores. Returns (start, end), both inclusive.

    The general form of `local_day_bounds` below, for a date somebody chose
    rather than today's — the Patients page's date filters, which have to be
    able to ask for last Tuesday. The same offset reasoning applies, and is
    why this is not `datetime.combine(local_date, time.min)`: a window built
    without the shift is the UTC day, and east of UTC that is not the day the
    staff mean.
    """
    offset = local_utc_offset()
    return (
        datetime.combine(local_date, time.min) - offset,
        datetime.combine(local_date, time.max) - offset,
    )


def local_naive_day_bounds(offset_days=0):
    """First and last instant of the practice's day on the local clock, left
    there rather than shifted into UTC. Returns (start, end), both inclusive.

    The counterpart of `local_day_bounds` for `scheduled_at`, the one column
    stored as local wall time. Using the UTC-shifted window on it moves the
    day by the practice's offset: east of UTC an evening booking falls out of
    "today" and last night's falls in, so the desk checks a patient in and the
    booking they already had is not found.
    """
    day = (datetime.now() + timedelta(days=offset_days)).date()
    return datetime.combine(day, time.min), datetime.combine(day, time.max)


def local_clock(column):
    """A UTC timestamp column as an expression on the practice's local clock.

    For the one place the two clocks have to meet:
    `coalesce(scheduled_at, created_at)`, the "when does this visit belong to"
    key that orders the appointment book and buckets it by date. Its first
    branch is local and its second is UTC, so without this the two halves sit
    the practice's offset apart -- a walk-in registered at 02:00 files itself
    under yesterday.

    A no-op on a UTC server, where the offset is zero and the shift would only
    add SQL for nothing.
    """
    minutes = int(local_utc_offset().total_seconds() // 60)
    if minutes == 0:
        return column
    from portal.extensions import db

    return db.func.date_add(column, db.text(f"INTERVAL {minutes} MINUTE"))


def local_day_bounds(offset_days=0):
    """First and last instant of the practice's day, as the naive UTC that
    every timestamp column stores. Returns (start, end), both inclusive.

    Use this for any "today" count instead of `datetime.utcnow().date()`.
    That reads the UTC date, which is not the local one: east of UTC it is
    still yesterday's date until the offset passes (05:30 in IST), so a
    window built from it drops the first five and a half hours of every
    working day — a patient registered at 6am does not count as registered
    today. The practice's day is wall-clock local, matching how the queue and
    every other date the staff read are built, so the bounds are taken from
    the local date and shifted back into UTC for the comparison.
    """
    return local_bounds_for((datetime.now() + timedelta(days=offset_days)).date())
