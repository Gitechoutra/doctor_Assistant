"""A pharmacist's profile, mirroring Doctor and Nurse.

The `users` row holds the login; this row says which branch counter they work.
That branch is what scopes their inventory: a pharmacist sees their own shelf,
and can look up other branches only to find out where a medicine is.
"""

from datetime import datetime

from portal.extensions import db


class Pharmacist(db.Model):
    __tablename__ = "pharmacists"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Not nullable: a pharmacist without a branch has no shelf to work from,
    # and every stock query below keys off it.
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"), nullable=False)
    license_no = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    user = db.relationship("User", back_populates="pharmacist_profile")
    branch = db.relationship("Branch")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.user.name if self.user else None,
            "email": self.user.email if self.user else None,
            "license_no": self.license_no,
            "branch_id": self.branch_id,
            "branch": self.branch.to_dict() if self.branch else None,
        }

    def __repr__(self):
        return f"<Pharmacist {self.user_id} @ {self.branch_id}>"
