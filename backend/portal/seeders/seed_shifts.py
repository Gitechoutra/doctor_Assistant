"""Gives every member of staff a usual shift and a fortnight of shifts to work.

Two different gaps, filled together because one is useless without the other:

  * `staff_profiles.shift` -- the slot a person *normally* works. An HR detail,
    one value, no dates. Most accounts had none, which is why the Availability
    screen could say nothing at all about a doctor with no shift that day.
  * `staff_shifts` -- the actual schedule, one row per person per day. This
    table was empty, so every Shifts screen in the application was correct and
    blank, and no doctor ever read as on duty.

Only ever additive, and safe to run again:

  * a person who already has a usual shift keeps it -- an existing value is a
    decision somebody made, and this is not the place to overrule it;
  * a day the person is already scheduled on is skipped, so a second run does
    not double-book anybody;
  * nothing is deleted, cancelled or reassigned.

Slots are handed out round-robin *within each role*, ordered by account id, so
the hospital gets cover across the day rather than every doctor arriving at
six. Which slots a role can be given is a judgement about the hospital, not a
rule the code can derive -- see `ROLE_SLOTS`.

    python -m portal.seeders.seed_shifts [days]
"""

from datetime import date, timedelta

from portal.extensions import db
from portal.helpers.shift_rules import clashing_shift
from portal.models.nurse import Nurse
from portal.models.role import STAFF_ROLES, Role
from portal.models.staff_profile import StaffProfile
from portal.models.staff_shift import SLOT_HOURS, StaffShift
from portal.models.user import User

# How far ahead to schedule. Matches the window the Shifts screen opens on, so
# a run of this is exactly what an administrator sees when they land there.
DEFAULT_DAYS = 14

# The slots each role is given. Doctors and nurses cover the night because the
# wards do; the front desk, the counter, the lab and the accounts office are
# day roles here, and inventing night shifts for them would be inventing a
# hospital. A deployment that runs a 24-hour lab changes this line.
ROLE_SLOTS = {
    "doctor": ("morning", "evening", "night"),
    "nurse": ("morning", "evening", "night"),
    "pharmacist": ("morning", "evening"),
    "lab_technician": ("morning", "evening"),
    "receptionist": ("morning", "evening"),
    "accountant": ("morning",),
    "other_staff": ("morning",),
}


def _staff_by_role():
    """Active staff accounts, grouped by role name and ordered by id.

    Admin is absent because the application will not schedule one: see
    `shift_routes._assignable_user`, which refuses an administrator account as
    a management login rather than a slot on the ward. Seeding shifts an
    administrator could never have created by hand would put the database and
    the API at odds on the first edit.
    """
    rows = (
        User.query.join(Role, User.role_id == Role.id)
        .filter(User.is_active.is_(True), Role.name.in_(STAFF_ROLES))
        .order_by(Role.name, User.id)
        .all()
    )
    grouped = {}
    for user in rows:
        grouped.setdefault(user.role.name, []).append(user)
    return grouped


def _profile_for(user):
    """The user's HR profile, created empty if they have none.

    Accounts made through the older `POST /doctors` and `POST /nursing/nurses`
    routes never got one -- only Staff Management writes it -- so this is also
    where those accounts stop being half-formed.
    """
    profile = StaffProfile.query.filter_by(user_id=user.id).first()
    if not profile:
        profile = StaffProfile(user_id=user.id)
        db.session.add(profile)
    return profile


def _usual_slot(user, profile, fallback):
    """The slot this person normally works, preferring what is already known.

    A nurse's own profile table has carried a shift since before
    `staff_profiles` existed, and it is a real answer recorded by a real
    person, so it wins over anything this seeder would invent.
    """
    if profile.shift:
        return profile.shift
    if user.nurse_profile and user.nurse_profile.shift:
        return user.nurse_profile.shift
    return fallback


def _department_for(user, profile):
    """Which department to stamp on the shift, if any is known."""
    if profile.department_id:
        return profile.department_id
    if user.doctor_profile and user.doctor_profile.department_id:
        return user.doctor_profile.department_id
    if user.nurse_profile and user.nurse_profile.department_id:
        return user.nurse_profile.department_id
    return None


def _already_scheduled(user_id, days):
    """The days in `days` this person is already on, so a re-run adds nothing.

    One query rather than one per day: a fortnight for fifteen people is two
    hundred round trips otherwise.
    """
    rows = db.session.query(StaffShift.shift_date).filter(
        StaffShift.user_id == user_id,
        StaffShift.status == "scheduled",
        StaffShift.shift_date.in_(days),
    )
    return {row[0] for row in rows}


def _would_clash(user_id, day, starts_at, ends_at):
    """Whether the API would refuse this shift as a double-booking.

    Checked with `helpers/shift_rules`, the same function the routes use, and
    against the session rather than the committed table -- the shifts this run
    has already added are pending, and a night shift added for yesterday is
    exactly what a morning shift today has to be checked against.
    """
    db.session.flush()
    return clashing_shift(user_id, day, starts_at, ends_at) is not None


def run(days=DEFAULT_DAYS, start=None):
    """Tops up usual shifts and the schedule. Returns (profiles, shifts) counts."""
    start = start or date.today()
    window = [start + timedelta(days=offset) for offset in range(days)]

    # Recorded as the author of every row, because `created_by_id` means "who
    # scheduled this" and leaving it null would read as a shift nobody owns.
    admin = User.query.join(Role).filter(Role.name == "admin").order_by(User.id).first()

    profiles_set = 0
    shifts_added = 0
    summary = []

    for role_name, users in sorted(_staff_by_role().items()):
        slots = ROLE_SLOTS.get(role_name, ("morning",))
        for index, user in enumerate(users):
            profile = _profile_for(user)
            slot = _usual_slot(user, profile, slots[index % len(slots)])

            if profile.shift != slot:
                profile.shift = slot
                profiles_set += 1
            # Staff Management keeps these two in step on every save; do the
            # same here so the nurse list and the HR profile cannot disagree.
            if user.nurse_profile and user.nurse_profile.shift != slot:
                user.nurse_profile.shift = slot

            starts_at, ends_at = SLOT_HOURS[slot]
            department_id = _department_for(user, profile)
            taken = _already_scheduled(user.id, window)

            added_for_user = 0
            for day in window:
                # Same day already covered, or the hours would overlap
                # something -- a night shift the day before, most often.
                if day in taken or _would_clash(user.id, day, starts_at, ends_at):
                    continue
                db.session.add(
                    StaffShift(
                        user_id=user.id,
                        shift_date=day,
                        slot=slot,
                        starts_at=starts_at,
                        ends_at=ends_at,
                        department_id=department_id,
                        status="scheduled",
                        created_by_id=admin.id if admin else None,
                    )
                )
                added_for_user += 1

            shifts_added += added_for_user
            summary.append((role_name, user.name, slot, added_for_user))

    db.session.commit()

    for role_name, name, slot, added in summary:
        print(f"  {role_name:<15} {name[:28]:<29} {slot:<8} +{added} shifts")
    print(
        f"  Shifts -> {shifts_added} added across {len(window)} days "
        f"({window[0]} to {window[-1]}); {profiles_set} usual shifts set"
    )
    return profiles_set, shifts_added


if __name__ == "__main__":
    import sys

    from portal import create_app

    requested = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DAYS
    app = create_app()
    with app.app_context():
        print(f"Scheduling {requested} days...")
        run(requested)
        print("Done.")
