from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Drives the icon/accent the bell menu renders for each row.
    category = db.Column(
        db.Enum(
            "appointment",
            "consultation",
            "report",
            "nursing",
            # A doctor's own patient list changed -- registered to them, or
            # routed to them by reception. Its own category rather than
            # "appointment": those are queue events, this is "you now have a
            # patient you didn't a moment ago," and the Alerts page reads it
            # out separately for exactly that reason.
            "patient_assignment",
            # A doctor prescribed something the catalogue lacks, and the
            # pharmacy is the only party who can close that gap.
            "pharmacy",
            # The administrator gave this person a shift. Its own category
            # rather than "system" because it is the one notification that
            # tells somebody where to be, and it should not sit behind the
            # same grey icon as a password notice.
            "shift",
            "system",
            name="notification_category",
        ),
        nullable=False,
        default="system",
    )
    title = db.Column(db.String(150), nullable=False)
    body = db.Column(db.String(255), nullable=True)
    # In-app route to open when the row is clicked, e.g. "/dashboard/appointments".
    link = db.Column(db.String(255), nullable=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    user = db.relationship("User")

    __table_args__ = (
        # The bell only ever asks "my unread, newest first", so the index is
        # built for exactly that query.
        db.Index("idx_notifications_user_read_created", "user_id", "is_read", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "category": self.category,
            "title": self.title,
            "body": self.body,
            "link": self.link,
            "is_read": self.is_read,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<Notification {self.id} {self.category}>"
