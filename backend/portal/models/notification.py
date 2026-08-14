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
            # Somebody joined the queue, arrived, or was booked.
            "appointment",
            # A consultation finished -- what tells the PA the patient is done
            # and they can settle up and call the next one in.
            "consultation",
            "report",
            # A patient was added to the practice. Its own category rather
            # than "appointment": that is a queue event, this is "there is
            # somebody on the books who wasn't a moment ago."
            "patient_assignment",
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
