from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from portal.extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    # The sign-in name the hospital issues, derived from the staff member's
    # own name (sandeep.viswanadh) by helpers/credentials. Nullable because
    # accounts predating it exist and sign in by email, which still works --
    # login accepts either. Unique, and MySQL allows any number of NULLs under
    # a unique index, so "not issued yet" costs nothing.
    #
    # Never reused: a username is how a staff member's actions read in the
    # audit trail, so handing a leaver's name to a new joiner would rewrite
    # history. helpers/credentials suffixes instead.
    username = db.Column(db.String(150), nullable=True, unique=True, index=True)
    email = db.Column(db.String(150), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=False)
    # Bare filename inside uploads/avatars (not a full path) so the storage
    # directory can move without a data migration.
    avatar_path = db.Column(db.String(255), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    last_login_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP, server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    role = db.relationship("Role", back_populates="users")
    doctor_profile = db.relationship(
        "Doctor", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    nurse_profile = db.relationship(
        "Nurse", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    pharmacist_profile = db.relationship(
        "Pharmacist", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    # HR details for Staff Management. Separate from the operational profiles
    # above, which the clinical code joins against — see models/staff_profile.
    staff_profile = db.relationship(
        "StaffProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)

    @property
    def avatar_url(self):
        """URL the browser can put straight in an <img src>, or None."""
        return f"/api/auth/avatar/{self.avatar_path}" if self.avatar_path else None

    def to_dict(self):
        # Doctors and nurses both sit in a department; whichever profile this
        # user has is where the department comes from, so one shape serves
        # every role instead of the frontend branching on it.
        profile = self.doctor_profile or self.nurse_profile
        return {
            "id": self.id,
            "name": self.name,
            "username": self.username,
            "email": self.email,
            "role": self.role.name if self.role else None,
            "avatar_url": self.avatar_url,
            "is_active": self.is_active,
            # The Doctor row's own id, not the department it sits in — an
            # Emergency Case is claimed by doctor id, so the client needs this
            # to tell "mine" from "someone else's" without a second lookup.
            "doctor_id": self.doctor_profile.id if self.doctor_profile else None,
            "specialization": (
                self.doctor_profile.specialization if self.doctor_profile else None
            ),
            "registration_no": (
                self.doctor_profile.registration_no if self.doctor_profile else None
            ),
            "department": (
                profile.department.name if profile and profile.department else None
            ),
            "department_id": profile.department_id if profile else None,
            # Nurse-only, null for everyone else — the nurse profile page reads
            # these the same way the doctor page reads specialization.
            "employee_no": (
                self.nurse_profile.employee_no if self.nurse_profile else None
            ),
            # No "shift" here. The session user used to carry the single
            # shift on the nurse profile, which the nursing sidebar showed
            # by default. Shifts are now dated rows an administrator
            # schedules, read from /api/shifts.
            # Pharmacy-only: which counter this user works. Every stock query
            # is scoped by it, so the frontend needs it on the session user.
            "branch_id": (
                self.pharmacist_profile.branch_id if self.pharmacist_profile else None
            ),
            "branch": (
                self.pharmacist_profile.branch.name
                if self.pharmacist_profile and self.pharmacist_profile.branch
                else None
            ),
        }

    def __repr__(self):
        return f"<User {self.email}>"
