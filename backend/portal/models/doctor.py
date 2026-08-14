from datetime import datetime

from portal.extensions import db


class Doctor(db.Model):
    """The practice's doctor.

    One row, in the ordinary case: this is one doctor's practice, and
    `helpers/practice.practice_doctor` is what every workflow resolves through
    rather than asking anyone to pick from a list. The table is still a table
    because a Consultation, a Patient and an Appointment all have to name the
    doctor they belong to, and because a practice that takes on a second doctor
    should not need a schema change to do it.

    No department. Departments were a hospital's org chart; a practice is one
    consulting room, and making anybody choose a department to book into it was
    a question with one possible answer.
    """

    __tablename__ = "doctors"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    specialization = db.Column(db.String(150), nullable=True)
    registration_no = db.Column(db.String(50), nullable=True)
    # Printed at the top of a prescription and a report, under the doctor's
    # name — "MBBS, MD (General Medicine)".
    qualification = db.Column(db.String(200), nullable=True)
    # The practice's own name, as it should appear on paperwork. Null falls
    # back to the doctor's name.
    practice_name = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    user = db.relationship("User", back_populates="doctor_profile")
    consultations = db.relationship("Consultation", back_populates="doctor")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.user.name if self.user else None,
            "email": self.user.email if self.user else None,
            "specialization": self.specialization,
            "qualification": self.qualification,
            "practice_name": self.practice_name,
            "registration_no": self.registration_no,
        }

    def __repr__(self):
        return f"<Doctor {self.user_id}>"
