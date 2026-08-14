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
    # The PA who set this doctor up. Nullable because a doctor can exist
    # without one -- a row created before this column, or the first doctor of a
    # practice seeded some other way -- and ON DELETE SET NULL rather than
    # CASCADE because removing the PA's account must not take the doctor, the
    # consultations hanging off them and the practice's whole record with it.
    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    # Two columns point at `users` now, so both relationships name the one they
    # travel: without this SQLAlchemy cannot tell which join it should make.
    user = db.relationship(
        "User", back_populates="doctor_profile", foreign_keys=[user_id]
    )
    created_by = db.relationship("User", foreign_keys=[created_by_user_id])
    consultations = db.relationship("Consultation", back_populates="doctor")

    def to_dict(self):
        creator = self.created_by
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.user.name if self.user else None,
            "email": self.user.email if self.user else None,
            "username": self.user.username if self.user else None,
            "is_active": self.user.is_active if self.user else None,
            "specialization": self.specialization,
            "qualification": self.qualification,
            "practice_name": self.practice_name,
            "registration_no": self.registration_no,
            # Who set them up. Both halves: the id for a client that wants to
            # compare it against the signed-in user, the name for one that just
            # wants to show it.
            "created_by_user_id": self.created_by_user_id,
            "created_by_name": creator.name if creator else None,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }

    def __repr__(self):
        return f"<Doctor {self.user_id}>"
