from datetime import date as date_cls, datetime, timedelta

from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.contact import normalize_email
from portal.helpers.credentials import unique_username
from portal.helpers.decorators import FRONT_DESK_ROLES, role_required
from portal.helpers.response import error, success
from portal.helpers.search import matches_all, terms_from
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.role import Role
from portal.models.staff_profile import StaffProfile
from portal.models.staff_shift import StaffShift
from portal.models.user import User

doctor_bp = Blueprint("doctors", __name__)

# How far ahead the front desk may look when checking availability. A month is
# further than anyone books an OP and keeps the query bounded.
MAX_AVAILABILITY_DAYS = 60


@doctor_bp.get("")
@jwt_required()
def list_doctors():
    """The doctor directory, optionally narrowed by department or `?search=`.

    Searchable by the three things somebody has when they are looking for a
    doctor: the name, the speciality, and the department they sit in.
    """
    query = Doctor.query.join(Doctor.user).order_by(Doctor.department_id)

    department_id = request.args.get("department_id", type=int)
    if department_id:
        query = query.filter(Doctor.department_id == department_id)

    terms = terms_from(request.args.get("search"))
    if terms:
        # Outer join: a doctor with no department on file must still be
        # findable by name rather than dropping out of every search.
        query = query.outerjoin(Department, Doctor.department_id == Department.id)
        query = query.filter(
            matches_all(
                terms,
                (User.name, Doctor.specialization, Department.name),
            )
        )

    return success([d.to_dict() for d in query.all()])


# ------------------------------------------------------- availability --


def _minutes(t):
    return t.hour * 60 + t.minute


def _window(shift, from_previous_day=False):
    """A shift as minutes from midnight on the day being asked about.

    A night shift is stored with an end time earlier than its start (22:00 ->
    06:00) rather than as two rows, so the end is pushed past 1440. Yesterday's
    night shift is then shifted back a day, which is what makes a doctor who
    started at 22:00 still read as on duty at 01:00 this morning.
    """
    start, end = _minutes(shift.starts_at), _minutes(shift.ends_at)
    if end <= start:
        end += 24 * 60
    if from_previous_day:
        start -= 24 * 60
        end -= 24 * 60
    return start, end


def _shift_entry(shift, start, end, from_previous_day):
    return {
        "id": shift.id,
        "slot": shift.slot,
        "starts_at": shift.starts_at.strftime("%H:%M"),
        "ends_at": shift.ends_at.strftime("%H:%M"),
        "crosses_midnight": shift.crosses_midnight,
        # True for the tail of yesterday's night shift. The card says "since
        # yesterday" rather than showing a start time that never happened today.
        "from_previous_day": from_previous_day,
        "department": shift.department.name if shift.department else None,
        "notes": shift.notes,
        # Minutes from midnight, for the timeline bar. Sent rather than derived
        # in the browser so both ends agree on where a night shift sits.
        "start_minute": start,
        "end_minute": end,
    }


def _availability_status(windows, now_minute, is_today):
    """What to call this doctor's day: (status, available_from, available_until).

    Only today has a "now" to be on either side of. For any other date the
    honest answer is just whether they have a shift that day at all.
    """
    if not windows:
        return "off", None, None
    if not is_today:
        # Windows that start before minute zero are the tail of the previous
        # night's shift; "available from 22:00" would name yesterday evening.
        starts = [w[0] for w in windows if w[0] >= 0]
        return "scheduled", (min(starts) if starts else None), None

    current = next((w for w in windows if w[0] <= now_minute < w[1]), None)
    if current:
        return "on_duty", None, current[1]

    upcoming = [w[0] for w in windows if w[0] > now_minute]
    if upcoming:
        return "upcoming", min(upcoming), None
    return "finished", None, None


def _hhmm(minute):
    """Minutes from midnight back to a wall-clock time, wrapped into the day.

    A night shift ends at minute 1800, which is 06:00 the next morning — the
    time a receptionist needs to be told, not the arithmetic.
    """
    if minute is None:
        return None
    return f"{(minute // 60) % 24:02d}:{minute % 60:02d}"


@doctor_bp.get("/availability")
@role_required(*FRONT_DESK_ROLES)
def doctor_availability():
    """Which doctors are working on a given day, and between what hours.

    The schedule itself stays private -- `GET /shifts` still shows
    a non-admin nothing but their own shifts -- because this answers a narrower
    question: reception needs to know when the doctor they are booking a
    patient with is in the building, not who else the hospital has scheduled.

    Times are wall-clock local, as `staff_shifts` stores them, and "now" is the
    server's clock. Both assume the deployment runs in the hospital's timezone,
    which is the same assumption the Shifts screen already makes.
    """
    raw_date = (request.args.get("date") or "").strip()
    if raw_date:
        try:
            day = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except ValueError:
            return error("date must be in YYYY-MM-DD format", status=422)
    else:
        day = date_cls.today()

    today = date_cls.today()
    if abs((day - today).days) > MAX_AVAILABILITY_DAYS:
        return error(
            f"date must be within {MAX_AVAILABILITY_DAYS} days of today", status=422
        )

    query = Doctor.query.join(Doctor.user).filter(User.is_active.is_(True))
    department_id = request.args.get("department_id", type=int)
    if department_id:
        query = query.filter(Doctor.department_id == department_id)
    doctors = query.order_by(User.name).all()

    user_ids = [d.user_id for d in doctors]
    shifts_by_user = {}
    if user_ids:
        rows = StaffShift.query.filter(
            StaffShift.user_id.in_(user_ids),
            StaffShift.status == "scheduled",
            # Yesterday is fetched too: a night shift scheduled on it runs into
            # the morning of the day being asked about.
            StaffShift.shift_date.in_([day, day - timedelta(days=1)]),
        ).all()
        for row in rows:
            shifts_by_user.setdefault(row.user_id, []).append(row)

    # The usual slot from the HR profile. Not a schedule -- it is what the
    # administrator recorded as this doctor's normal shift -- so it is only
    # ever shown as context for a day they have no shift on.
    usual_by_user = {}
    if user_ids:
        for profile in StaffProfile.query.filter(StaffProfile.user_id.in_(user_ids)).all():
            usual_by_user[profile.user_id] = profile.shift

    is_today = day == today
    now = datetime.now()
    now_minute = now.hour * 60 + now.minute

    items = []
    for doctor in doctors:
        entries, windows = [], []
        for shift in shifts_by_user.get(doctor.user_id, []):
            from_previous_day = shift.shift_date != day
            # Yesterday's day shifts are irrelevant to today; only one that ran
            # past midnight still covers any of it.
            if from_previous_day and not shift.crosses_midnight:
                continue
            start, end = _window(shift, from_previous_day)
            entries.append(_shift_entry(shift, start, end, from_previous_day))
            windows.append((start, end))

        entries.sort(key=lambda e: e["start_minute"])
        status, from_minute, until_minute = _availability_status(
            windows, now_minute, is_today
        )

        items.append(
            {
                "id": doctor.id,
                "user_id": doctor.user_id,
                "name": doctor.user.name if doctor.user else None,
                "avatar_url": doctor.user.avatar_url if doctor.user else None,
                "department_id": doctor.department_id,
                "department": doctor.department.name if doctor.department else None,
                "specialization": doctor.specialization,
                "status": status,
                "on_duty": status == "on_duty",
                # When they next start, and when the shift they are in now ends.
                "available_from": _hhmm(from_minute),
                "available_until": _hhmm(until_minute),
                "usual_shift": usual_by_user.get(doctor.user_id),
                "shifts": entries,
                # The length of the shifts covering this day, so a row can be
                # read without adding the windows up. Deliberately the whole
                # shift rather than the part falling inside the day: it is
                # shown beside "22:00 - 06:00", and 6 hrs next to an eight-hour
                # window reads as a mistake.
                "hours": round(sum(end - start for start, end in windows) / 60, 1),
            }
        )

    return success(
        {
            "date": day.isoformat(),
            "is_today": is_today,
            # What the status fields were computed against. A screen left open
            # over a shift change is showing a stale answer, and this is what
            # lets it say so.
            "as_of": now.strftime("%H:%M") if is_today else None,
            "on_duty_count": sum(1 for i in items if i["on_duty"]),
            "scheduled_count": sum(1 for i in items if i["shifts"]),
            "items": items,
        }
    )


@doctor_bp.post("")
@role_required("admin")
def create_doctor():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    email, email_error = normalize_email(payload.get("email"))
    password = payload.get("password") or ""
    department_id = payload.get("department_id")

    if email_error:
        return error(email_error, status=422)
    if not name or not email or not password or not department_id:
        return error("name, email, password, and department_id are required", status=422)

    if User.query.filter_by(email=email).first():
        return error("A user with this email already exists", status=409)

    if not Department.query.get(department_id):
        return error("Department not found", status=404)

    doctor_role = Role.query.filter_by(name="doctor").first()

    # The credentials flow proper lives in Staff Management; this older route
    # still takes a password from the caller. It gets a username all the same,
    # so an account created here is not the one exception in the staff list —
    # see helpers/bootstrap.ensure_usernames for the rest of that story.
    user = User(
        name=name, email=email, username=unique_username(name, email), role_id=doctor_role.id
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()  # assigns user.id before the Doctor row references it

    doctor = Doctor(
        user_id=user.id,
        department_id=department_id,
        specialization=payload.get("specialization") or None,
        registration_no=payload.get("registration_no") or None,
    )
    db.session.add(doctor)
    db.session.commit()

    return success(doctor.to_dict(), message="Doctor created", status=201)
