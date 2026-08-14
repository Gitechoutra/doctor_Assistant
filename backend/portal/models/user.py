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
    # The only profile table left. A PA's user row is their whole account —
    # see models/role.ROLES_WITH_PROFILE.
    doctor_profile = db.relationship(
        "Doctor",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        # `doctors` also carries `created_by_user_id`, so this names the column
        # it travels. Without it SQLAlchemy sees two paths to `users` and
        # cannot choose -- and the cascade above must only ever follow the
        # doctor's *own* account, never the PA who created them.
        foreign_keys="Doctor.user_id",
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
        from portal.models.role import role_label

        doctor = self.doctor_profile
        return {
            "id": self.id,
            "name": self.name,
            "username": self.username,
            "email": self.email,
            "role": self.role.name if self.role else None,
            # "PA" / "Doctor", so the UI never has to title-case a slug and
            # never renders "Pa".
            "role_label": role_label(self.role.name) if self.role else None,
            "avatar_url": self.avatar_url,
            "is_active": self.is_active,
            # The Doctor row's own id. Null for the PA, and every "is this my
            # patient / my consultation?" check on the client reads it.
            "doctor_id": doctor.id if doctor else None,
            "specialization": doctor.specialization if doctor else None,
            "qualification": doctor.qualification if doctor else None,
            "registration_no": doctor.registration_no if doctor else None,
            "practice_name": doctor.practice_name if doctor else None,
        }

    def __repr__(self):
        return f"<User {self.email}>"
