from datetime import date, datetime, timedelta

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

# The surgical pathway, in order. A patient with no surgery on the cards is
# simply NULL here — that is the ordinary case, and it is what keeps the nurse
# hand-off off the screen for everybody who does not need one.
#
#   required             the doctor has said this case needs surgery. A nurse
#                        may now be assigned for the post-operative watch.
#   post_op              surgery is done; the observation clock is running.
#   ready_for_discharge  the observation window has elapsed. Nothing is closed
#                        automatically — a patient still unwell on day four is
#                        still the nurse's patient, exactly as with the
#                        nursing assignment's own end date.
SURGERY_STAGES = ("required", "post_op", "ready_for_discharge")

# How long a post-operative watch is planned for when the doctor doesn't say.
DEFAULT_OBSERVATION_DAYS = 3
MAX_OBSERVATION_DAYS = 90

# The eight ABO/Rh groups, and the only values `patients.blood_group` may hold.
#
# A closed list rather than free text because of what this field is for: it is
# read before a transfusion is arranged and printed on the record a nurse works
# from. "P+" is not a typo anyone catches downstream -- it is a group that does
# not exist, sitting where a real one is expected. The column is left a String
# rather than an Enum so a correction does not need a migration, which makes
# `normalize_blood_group` the actual boundary; every write path goes through it.
BLOOD_GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")


def normalize_blood_group(raw):
    """Returns (value, error_message) for a blood group off a form or the API.

    Empty is allowed and means "not recorded" -- reception often registers a
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
    # Bare filename inside uploads/patients, same convention as users.avatar_path.
    photo_path = db.Column(db.String(255), nullable=True)
    # The doctor this patient belongs to. Front desk picks them at
    # registration based on the condition; only that doctor (and
    # admin/reception) can see the patient afterwards.
    assigned_doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(150), nullable=True)
    blood_group = db.Column(db.String(5), nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    medical_history = db.Column(db.Text, nullable=True)
    # OP (out-patient) registration status for this patient's most recent OP:
    # 'paid' on their very first registration, then 'free' if they register
    # again within 15 days (follow-up), 'paid' otherwise.
    op_status = db.Column(db.Enum("free", "paid", name="op_status"), nullable=True)
    last_registered_at = db.Column(db.DateTime, nullable=True)

    # --- The surgical pathway ----------------------------------------------
    # NULL for the great majority of patients: no surgery, and therefore no
    # nurse hand-off offered anywhere in the UI or accepted by the API.
    surgery_stage = db.Column(
        db.Enum(*SURGERY_STAGES, name="patient_surgery_stage"), nullable=True
    )
    surgery_marked_at = db.Column(db.DateTime, nullable=True)
    surgery_completed_at = db.Column(db.DateTime, nullable=True)
    # The doctor's plan for how long to watch after surgery. Configurable per
    # patient; DEFAULT_OBSERVATION_DAYS when they don't set one.
    observation_days = db.Column(db.Integer, nullable=True)
    # When that watch is expected to finish. An expectation, not a deadline —
    # passing it moves the patient to `ready_for_discharge`, which is a prompt
    # to the doctor, not a discharge.
    observation_ends_at = db.Column(db.DateTime, nullable=True)
    surgery_notes = db.Column(db.Text, nullable=True)

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
        """Whole years, or None when no date of birth is on file."""
        if not self.dob:
            return None
        today = date.today()
        # Subtract a year when this year's birthday hasn't happened yet.
        return today.year - self.dob.year - ((today.month, today.day) < (self.dob.month, self.dob.day))

    @property
    def photo_url(self):
        return f"/api/patients/photo/{self.photo_path}" if self.photo_path else None

    # --- The surgical pathway ----------------------------------------------

    @property
    def is_surgical(self):
        """Whether this patient is anywhere on the surgical pathway.

        The single question the nurse hand-off is gated on, in the UI and on
        the API both — a non-surgical patient is never offered a nurse and is
        refused one if the request is made anyway.
        """
        return self.surgery_stage is not None

    @property
    def observation_days_planned(self):
        return self.observation_days or DEFAULT_OBSERVATION_DAYS

    @property
    def observation_days_left(self):
        """Days still to run on the post-operative watch, or None when no watch
        is running. Rounded up, so a few hours left reads as "1 day" rather
        than as none."""
        if self.surgery_stage != "post_op" or not self.observation_ends_at:
            return None
        seconds = (self.observation_ends_at - datetime.utcnow()).total_seconds()
        if seconds <= 0:
            return 0
        return int(-(-seconds // 86400))

    def mark_surgery_required(self, notes=None, observation_days=None):
        """The doctor's decision that this case needs surgery.

        Only this opens the nurse hand-off. Re-marking a patient who is already
        past this point does nothing: the pathway only ever runs forwards.
        """
        if self.surgery_stage is None:
            self.surgery_stage = "required"
            self.surgery_marked_at = datetime.utcnow()
        if notes is not None:
            self.surgery_notes = notes
        if observation_days is not None:
            self.observation_days = observation_days

    def clear_surgery(self):
        """Takes the patient back off the pathway — the case turned out not to
        need surgery, or the watch is over and they have been discharged."""
        self.surgery_stage = None
        self.surgery_marked_at = None
        self.surgery_completed_at = None
        self.observation_ends_at = None
        self.observation_days = None
        self.surgery_notes = None

    def complete_surgery(self, observation_days=None):
        """Surgery is done: the patient moves to post-operative observation and
        the clock starts. Returns the moment the watch is expected to end.

        Truncated to the second before it is stored. These are plain DATETIME
        columns, and MySQL *rounds* a sub-second value rather than truncating
        it — half the time that pushed the end date half a second into the
        future, which is enough to make `observation_days_left` ceil a 3-day
        watch to 4 the moment it started.
        """
        now = datetime.utcnow().replace(microsecond=0)
        if observation_days is not None:
            self.observation_days = observation_days
        self.surgery_stage = "post_op"
        self.surgery_completed_at = now
        self.observation_ends_at = now + timedelta(days=self.observation_days_planned)
        return self.observation_ends_at

    def refresh_surgery_stage(self):
        """Advances `post_op` to `ready_for_discharge` once the watch is up.

        Evaluated when the record is read rather than by a scheduled job: the
        only thing the transition changes is what the doctor is shown, so it
        cannot be missed by nobody looking, and there is no background worker
        to keep alive. Returns True when it changed something, so the caller
        knows to commit.
        """
        if (
            self.surgery_stage == "post_op"
            and self.observation_ends_at
            and datetime.utcnow() >= self.observation_ends_at
        ):
            self.surgery_stage = "ready_for_discharge"
            return True
        return False

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
                    "department_id": self.assigned_doctor.department_id,
                    "department": (
                        self.assigned_doctor.department.name
                        if self.assigned_doctor.department
                        else None
                    ),
                }
                if self.assigned_doctor
                else None
            ),
            "phone": self.phone,
            "email": self.email,
            "blood_group": self.blood_group,
            "allergies": self.allergies,
            "medical_history": self.medical_history,
            "op_status": self.op_status,
            "last_registered_at": to_utc_iso(self.last_registered_at),
            # The surgical pathway. `surgery_stage` is null for a patient who
            # needs no surgery, which is what every "should a nurse be offered
            # here?" check in the UI reads.
            "surgery_stage": self.surgery_stage,
            "is_surgical": self.is_surgical,
            "surgery_marked_at": to_utc_iso(self.surgery_marked_at),
            "surgery_completed_at": to_utc_iso(self.surgery_completed_at),
            "surgery_notes": self.surgery_notes,
            "observation_days": self.observation_days_planned,
            "observation_ends_at": to_utc_iso(self.observation_ends_at),
            "observation_days_left": self.observation_days_left,
        }

    def __repr__(self):
        return f"<Patient {self.name}>"
