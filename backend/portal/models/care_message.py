"""Doctor and nurse talking about one patient.

A thread hangs off a nursing assignment, not off the two people: the
conversation is part of that patient's care record, so it stays readable when
the shift changes hands and a different nurse takes over.

Distinct from `ClinicalAlert`, which is an escalation with a lifecycle
(open -> acknowledged -> resolved). This is ordinary back-and-forth --
"hold the evening dose", "BP settled after the second reading" -- and it has
no state beyond having been read.
"""

from datetime import datetime

from portal.extensions import db
from portal.models.types import PRECISE_DATETIME, PRECISE_TIMESTAMP
from portal.helpers.datetime_helper import to_utc_iso

SENDER_ROLES = ("doctor", "nurse", "admin")


class CareMessage(db.Model):
    __tablename__ = "care_messages"

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("nursing_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    # Snapshotted rather than read back through the user: what matters to a
    # reader is that the instruction came from the doctor at the time, even if
    # that account later changes role or is deactivated.
    sender_role = db.Column(db.Enum(*SENDER_ROLES, name="care_message_sender"), nullable=False)
    body = db.Column(db.Text, nullable=False)
    # When the other side opened the thread. Null means unread, which is what
    # drives the badge on both dashboards.
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(
        PRECISE_TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow
    )

    assignment = db.relationship("NursingAssignment", back_populates="messages")
    sender = db.relationship("User")

    __table_args__ = (
        db.Index("idx_care_messages_assignment_created", "assignment_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "sender_id": self.sender_id,
            "sender_role": self.sender_role,
            "sender": self.sender.name if self.sender else None,
            "sender_avatar_url": self.sender.avatar_url if self.sender else None,
            "body": self.body,
            "read_at": to_utc_iso(self.read_at),
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<CareMessage {self.id} from {self.sender_role}>"
