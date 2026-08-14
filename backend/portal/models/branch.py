"""A physical hospital location.

Introduced for the pharmacy: stock is held per branch, so "do we have this?"
only means something once there is somewhere for it to be. Staff who belong to
a location (currently pharmacists) carry a branch; clinical staff do not yet,
so nothing existing changes.
"""

from datetime import datetime

from portal.extensions import db


class Branch(db.Model):
    __tablename__ = "branches"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    # Short human code used on labels and in search results, e.g. "KKD".
    code = db.Column(db.String(12), nullable=False, unique=True)
    city = db.Column(db.String(120), nullable=True)
    address = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "city": self.city,
            "address": self.address,
            "phone": self.phone,
            "is_active": self.is_active,
        }

    def __repr__(self):
        return f"<Branch {self.code}>"
