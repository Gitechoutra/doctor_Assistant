from datetime import datetime

from portal.extensions import db

# The departments a general hospital runs.
#
# Kept here, beside the model, for the same reason DEFAULT_ROLES lives in
# models/role.py: this is the list the application is written against, and it
# had previously been split in two — four names in the seeder and twelve more
# inserted by migration f7a3c58e91b2 — so a database could end up with one
# half and not the other. `helpers/bootstrap.ensure_departments` reconciles
# against this single list at start-up.
#
# The first four come first because they are the ones the seeded demo doctors
# belong to; the order is otherwise not significant.
DEFAULT_DEPARTMENTS = (
    "Orthopedics",
    "Gynecology",
    "Gastroenterology",
    "General Medicine",
    "Cardiology",
    "Oncology",
    "Neurology",
    "Pediatrics",
    "Dermatology",
    "ENT",
    "Ophthalmology",
    "Pulmonology",
    "Nephrology",
    "Endocrinology",
    "Psychiatry",
    "Urology",
)


class Department(db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    doctors = db.relationship("Doctor", back_populates="department")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "doctor_count": len(self.doctors)}

    def __repr__(self):
        return f"<Department {self.name}>"
