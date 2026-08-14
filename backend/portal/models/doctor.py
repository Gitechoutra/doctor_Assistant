from datetime import datetime

from portal.extensions import db


class Doctor(db.Model):
    __tablename__ = "doctors"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    specialization = db.Column(db.String(150), nullable=True)
    registration_no = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    user = db.relationship("User", back_populates="doctor_profile")
    department = db.relationship("Department", back_populates="doctors")
    consultations = db.relationship("Consultation", back_populates="doctor")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.user.name if self.user else None,
            "email": self.user.email if self.user else None,
            "specialization": self.specialization,
            "department": self.department.name if self.department else None,
            "registration_no": self.registration_no,
        }

    def __repr__(self):
        return f"<Doctor {self.user_id}>"
