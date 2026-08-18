from datetime import date, datetime

from werkzeug.security import check_password_hash, generate_password_hash

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

# The eight ABO/Rh groups, and the only values `patients.blood_group` may hold.
#
# A closed list rather than free text because of what this field is for: it is
# read before anything is transfused and printed on the record. "P+" is not a
# typo anyone catches downstream -- it is a group that does not exist, sitting
# where a real one is expected. The column is left a String rather than an Enum
# so a correction does not need a migration, which makes
# `normalize_blood_group` the actual boundary; every write path goes through it.
BLOOD_GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")


def normalize_blood_group(raw):
    """Returns (value, error_message) for a blood group off a form or the API.

    Empty is allowed and means "not recorded" -- the desk often registers a
    patient before anyone has typed it -- so blank comes back as None with no
    error. Anything present must be one of `BLOOD_GROUPS`.

    Case and spacing are forgiven ("o+", " AB- ") because they are the same
    group written carelessly. Nothing else is: "O" without a sign is not a
    blood group, and guessing which one it meant is exactly the kind of help
    this field must not offer.
    """
    if raw is None:
        return None, None
    value = str(raw).strip().upper().replace(" ", "")
    if not value:
        return None, None
    if value not in BLOOD_GROUPS:
        return None, f"blood_group must be one of: {', '.join(BLOOD_GROUPS)}"
    return value, None


class Patient(db.Model):
    __tablename__ = "patients"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    gender = db.Column(db.Enum("male", "female", "other", name="patient_gender"), nullable=True)
    dob = db.Column(db.Date, nullable=True)
    # Recorded when the patient does not know their date of birth, which is
    # common. `age` prefers the date when there is one and falls back to this,
    # so nothing downstream has to know which was given.
    age_years = db.Column(db.Integer, nullable=True)
    # Bare filename inside uploads/patients, same convention as users.avatar_path.
    photo_path = db.Column(db.String(255), nullable=True)
    # The practice's doctor. Set automatically at registration — see
    # `helpers/practice.practice_doctor` — rather than chosen on the form:
    # there is one doctor, and asking the PA to pick them every time was a
    # question with one answer. Kept as a column because consultations,
    # appointments and reports all read "whose patient is this" from here.
    assigned_doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(150), nullable=True)
    address = db.Column(db.Text, nullable=True)
    blood_group = db.Column(db.String(5), nullable=True)
    emergency_contact_name = db.Column(db.String(150), nullable=True)
    emergency_contact_phone = db.Column(db.String(20), nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    medical_history = db.Column(db.Text, nullable=True)
    # Long-standing conditions — diabetes, hypertension — as distinct from
    # `medical_history`, which is the narrative of what has happened. Kept
    # apart because this is the list a doctor scans before prescribing.
    existing_conditions = db.Column(db.Text, nullable=True)
    # The desk's own notes: "prefers morning slots", "comes with their son".
    # Not clinical, and deliberately not searched.
    notes = db.Column(db.Text, nullable=True)
    # When this patient was last put in the queue. Drives "recently seen"
    # ordering and the follow-up window on the appointment form.
    last_registered_at = db.Column(db.DateTime, nullable=True)

    # -- The patient's own sign-in, for the patient portal ------------------
    #
    # Deliberately here and not in `users`. A staff account and a patient
    # account are not the same kind of thing wearing different roles: every
    # staff route is `@jwt_required()` and resolves "which doctor am I?" by
    # looking for a Doctor profile, treating *no profile* as the PA who sees
    # the practice's whole book. A patient row in `users` would therefore have
    # been read as the desk by every route that never thought to ask, and one
    # forgotten decorator would have handed a patient the practice.
    #
    # Two identity spaces instead, which cannot be confused because they do
    # not share a table, a token shape or a route prefix -- see
    # `helpers/portal_auth`.
    #
    # Nullable throughout: the practice registers most of its patients at the
    # desk and they never sign in at all. A patient with no `portal_email` is
    # simply a patient, exactly as before.
    portal_email = db.Column(db.String(150), nullable=True, unique=True, index=True)
    portal_password_hash = db.Column(db.String(255), nullable=True)
    # Lets the desk revoke access without deleting the credential -- the row
    # stays, so the audit trail still reads correctly, and turning it back on
    # does not need the patient to enrol again.
    portal_enabled = db.Column(db.Boolean, nullable=False, default=True)
    portal_last_login_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP, server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    consultations = db.relationship("Consultation", back_populates="patient")
    assigned_doctor = db.relationship("Doctor", foreign_keys=[assigned_doctor_id])

    @property
    def code(self):
        """Human-facing patient ID, e.g. PAT0004."""
        return f"PAT{self.id:04d}"

    @property
    def age(self):
        """Whole years, from the date of birth if there is one and from the
        recorded age otherwise. None when neither was given."""
        if self.dob:
            today = date.today()
            # Subtract a year when this year's birthday hasn't happened yet.
            return (
                today.year
                - self.dob.year
                - ((today.month, today.day) < (self.dob.month, self.dob.day))
            )
        return self.age_years

    @property
    def photo_url(self):
        return f"/api/patients/photo/{self.photo_path}" if self.photo_path else None

    # -- Portal credentials -------------------------------------------------

    def set_portal_password(self, raw_password):
        self.portal_password_hash = generate_password_hash(raw_password)

    def check_portal_password(self, raw_password):
        """False rather than an exception for a patient who has never enrolled,
        so the sign-in route can treat "no account" and "wrong password"
        identically and give nothing away about which it was."""
        if not self.portal_password_hash:
            return False
        return check_password_hash(self.portal_password_hash, raw_password)

    @property
    def has_portal_access(self):
        """Whether this patient can sign in right now. Enrolled *and* not
        revoked -- both, because the desk turning access off must not be
        undone by the patient simply still knowing their password."""
        return bool(self.portal_password_hash) and bool(self.portal_enabled)

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "gender": self.gender,
            "dob": self.dob.isoformat() if self.dob else None,
            "age": self.age,
            "photo_url": self.photo_url,
            "assigned_doctor_id": self.assigned_doctor_id,
            "assigned_doctor": (
                {
                    "id": self.assigned_doctor.id,
                    "name": self.assigned_doctor.user.name if self.assigned_doctor.user else None,
                    "specialization": self.assigned_doctor.specialization,
                }
                if self.assigned_doctor
                else None
            ),
            "phone": self.phone,
            "email": self.email,
            "address": self.address,
            "blood_group": self.blood_group,
            "emergency_contact_name": self.emergency_contact_name,
            "emergency_contact_phone": self.emergency_contact_phone,
            "allergies": self.allergies,
            "medical_history": self.medical_history,
            "existing_conditions": self.existing_conditions,
            "notes": self.notes,
            "last_registered_at": to_utc_iso(self.last_registered_at),
            # Whether this patient signs in to the portal, for the desk's
            # record screen. The credential itself never leaves the server.
            "portal_email": self.portal_email,
            "has_portal_access": self.has_portal_access,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<Patient {self.name}>"
