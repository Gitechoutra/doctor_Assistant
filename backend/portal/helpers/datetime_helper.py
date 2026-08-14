from datetime import datetime, time, timedelta


def to_utc_iso(dt):
    """Serializes a naive UTC datetime (as stored by db.func.now()/utcnow()) with an
    explicit 'Z' suffix so JS `new Date(...)` parses it as UTC instead of local time."""
    if dt is None:
        return None
    return dt.isoformat() + "Z"


def local_utc_offset():
    """How far the hospital's clock runs ahead of UTC (+5:30 on an IST server).

    Read from the machine rather than hard-coded: the same code has to be
    right on a UTC server, where this is zero and every helper below becomes
    a no-op.
    """
    return datetime.now().astimezone().utcoffset() or timedelta(0)


def local_day_bounds(offset_days=0):
    """First and last instant of the hospital's day, as the naive UTC that
    every timestamp column stores. Returns (start, end), both inclusive.

    Use this for any "today" count instead of `datetime.utcnow().date()`.
    That reads the UTC date, which is not the local one: east of UTC it is
    still yesterday's date until the offset passes (05:30 in IST), so a
    window built from it drops the first five and a half hours of every
    working day — a patient registered at 6am does not count as registered
    today. The hospital's day is wall-clock local, matching how shifts and
    every other date the staff read are built, so the bounds are taken from
    the local date and shifted back into UTC for the comparison.
    """
    local_date = (datetime.now() + timedelta(days=offset_days)).date()
    offset = local_utc_offset()
    return (
        datetime.combine(local_date, time.min) - offset,
        datetime.combine(local_date, time.max) - offset,
    )
