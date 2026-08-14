"""One scheduled shift: a member of staff, a date, and the hours they work it.

This is the hospital's shift *schedule*, and it is deliberately separate from
the `shift` column on `staff_profiles` and `nurses`. Those record the slot a
person *normally* works — one value, no date, no history — which is fine as a
hint on a form and useless as a schedule. You cannot ask it who is on
tonight, and you cannot change next Tuesday without changing every other day
too.

A row here answers those questions, so:

  * `user_id` is nullable. An administrator drafts the week's schedule first
    and fills the names in after; an unassigned row is a slot that still needs
    someone, which is a real state worth being able to see.
  * cancelling is a status change, not a delete. "Who was meant to be on that
    night" stays answerable after the shift schedule changes.
  * `starts_at`/`ends_at` are stored explicitly rather than derived from the
    slot name, so a one-off short shift does not need a new enum member.

Times are wall-clock local to the hospital. There is one site per deployment
and a schedule is read by people standing in it — storing 22:00 as UTC would
make a night shift render as a different day for half the year.
"""

from datetime import datetime, time

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

# The named slots a schedule is normally built from. `custom` is the escape
# hatch for a shift that does not fit one, so the enum never blocks a real one.
SHIFT_SLOTS = ("morning", "evening", "night", "custom")

# Default hours per slot, applied when the administrator picks a slot and
# leaves the times alone. Night deliberately ends before it starts — see
# `crosses_midnight`.
SLOT_HOURS = {
    "morning": (time(6, 0), time(14, 0)),
    "evening": (time(14, 0), time(22, 0)),
    "night": (time(22, 0), time(6, 0)),
}

# `cancelled` is kept rather than deleted so the schedule has a history.
SHIFT_STATUSES = ("scheduled", "cancelled")


class StaffShift(db.Model):
    __tablename__ = "staff_shifts"

    id = db.Column(db.Integer, primary_key=True)

    # Null while the slot is still unfilled. ondelete SET NULL rather than
    # CASCADE: removing an account should not silently erase the fact that
    # somebody was scheduled that night.
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    shift_date = db.Column(db.Date, nullable=False, index=True)
    slot = db.Column(db.Enum(*SHIFT_SLOTS, name="staff_shift_slot"), nullable=False)
    starts_at = db.Column(db.Time, nullable=False)
    ends_at = db.Column(db.Time, nullable=False)

    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"), nullable=True)

    status = db.Column(
        db.Enum(*SHIFT_STATUSES, name="staff_shift_status"),
        nullable=False,
        default="scheduled",
        server_default="scheduled",
    )
    notes = db.Column(db.String(500), nullable=True)

    # Who scheduled it. Always an admin — the routes allow nobody else to write
    # — but recorded rather than assumed, because that may not stay true.
    created_by_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # Explicit foreign_keys: two columns point at `users`, so SQLAlchemy cannot
    # work out which one each relationship follows on its own.
    user = db.relationship("User", foreign_keys=[user_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    department = db.relationship("Department")
    branch = db.relationship("Branch")

    __table_args__ = (
        # The two reads this table gets: "the schedule between these dates"
        # and "my shifts". Both are covered by the same composite.
        db.Index("idx_staff_shift_user_date", "user_id", "shift_date"),
        db.Index("idx_staff_shift_date_status", "shift_date", "status"),
    )

    @property
    def crosses_midnight(self):
        """True for a shift that ends the following day, e.g. 22:00–06:00.

        Stored as an end time earlier than the start rather than as a second
        date: a night shift is one shift, and giving it two dates would make
        it appear twice on a week's shift schedule.
        """
        return self.ends_at <= self.starts_at

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "staff_name": self.user.name if self.user else None,
            "staff_role": self.user.role.name if self.user and self.user.role else None,
            "staff_avatar_url": self.user.avatar_url if self.user else None,
            "assigned": self.user_id is not None,
            "shift_date": self.shift_date.isoformat() if self.shift_date else None,
            "slot": self.slot,
            "starts_at": self.starts_at.strftime("%H:%M") if self.starts_at else None,
            "ends_at": self.ends_at.strftime("%H:%M") if self.ends_at else None,
            "crosses_midnight": self.crosses_midnight,
            "department_id": self.department_id,
            "department": self.department.name if self.department else None,
            "branch_id": self.branch_id,
            "branch": self.branch.name if self.branch else None,
            "status": self.status,
            "notes": self.notes,
            "created_by": self.created_by.name if self.created_by else None,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<StaffShift {self.shift_date} {self.slot} user={self.user_id}>"
