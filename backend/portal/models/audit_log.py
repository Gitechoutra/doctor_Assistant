from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class AuditLog(db.Model):
    """Append-only record of who changed what.

    Nothing in the app updates or deletes a row here -- that is the point. The
    user FK is ON DELETE SET NULL rather than CASCADE for the same reason: a
    deactivated account must not erase the trail of what it did.
    """

    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = db.Column(db.String(100), nullable=False)
    entity = db.Column(db.String(100), nullable=True)
    entity_id = db.Column(db.Integer, nullable=True)
    # Snapshotted from the JWT, not read back through user_id: a user's role
    # can change later, and the log has to say what they were at the time.
    actor_role = db.Column(db.String(50), nullable=True)
    detail = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    user = db.relationship("User")

    __table_args__ = (
        # The two questions the log actually gets asked: "what happened to this
        # record" and "what did this person do".
        db.Index("idx_audit_entity", "entity", "entity_id", "created_at"),
        db.Index("idx_audit_user_created", "user_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "action": self.action,
            "entity": self.entity,
            "entity_id": self.entity_id,
            "actor_role": self.actor_role,
            "actor": self.user.name if self.user else None,
            "detail": self.detail,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<AuditLog {self.action} {self.entity}:{self.entity_id}>"
