from datetime import datetime

from portal.extensions import db

SHIFTS = ("morning", "evening", "night")


class Nurse(db.Model):
    """A nursing staff profile, mirroring Doctor: the `users` row holds the
    login, this row holds who they are on the ward."""

    __tablename__ = "nurses"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    employee_no = db.Column(db.String(50), nullable=True)
    # The shift they normally work. Handover notes record the actual shift, so
    # this is only a default for the picker, never the source of truth.
    shift = db.Column(db.Enum(*SHIFTS, name="nurse_shift"), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    user = db.relationship("User", back_populates="nurse_profile")
    department = db.relationship("Department")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.user.name if self.user else None,
            "email": self.user.email if self.user else None,
            "avatar_url": self.user.avatar_url if self.user else None,
            "employee_no": self.employee_no,
            "shift": self.shift,
            "department_id": self.department_id,
            "department": self.department.name if self.department else None,
        }

    def __repr__(self):
        return f"<Nurse {self.user_id}>"
