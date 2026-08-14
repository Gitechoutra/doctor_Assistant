"""Laboratory test requests, and the conversation about each one.

A doctor orders a test for one patient; a lab technician collects the sample,
runs it, uploads the report and hands it back. The row below is that whole
exchange, and it is deliberately anchored to a patient and a single test —
there is no lab inbox, no general queue, and no chat that exists apart from a
request. Every message in `LabMessage` hangs off exactly one `LabRequest`,
which is what keeps a clinical discussion attached to the patient it concerns.

Status is a straight line with one loop back:

    ordered -> sample_collected -> processing -> completed -> verified
                    ^                                  |
                    +------- recollection requested ----+

`ordered` is where a recollection puts it, because that is literally the state
it returns to: the sample is void and someone has to take another. Cancelled
is separate and terminal.

Who moves it is split on purpose (see routes/lab_routes.py): the technician
drives everything up to `completed`, and only the requesting doctor may mark a
result `verified`. That mirrors prescription sign-off elsewhere in this
application — the person who ordered the work is the one who accepts it.
"""

from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

LAB_STATUSES = (
    "ordered",
    "sample_collected",
    "processing",
    "completed",
    "verified",
    "cancelled",
)

# What a technician may set, and what a doctor may set. Enforced in the route;
# kept here so the two lists sit beside the enum they refer to.
TECHNICIAN_STATUSES = ("sample_collected", "processing", "completed")
DOCTOR_STATUSES = ("verified", "cancelled")

# The order above, as positions, so a route can refuse to walk a request
# backwards without hard-coding pairs of states.
STATUS_ORDER = {name: i for i, name in enumerate(LAB_STATUSES)}

LAB_PRIORITIES = ("routine", "urgent")

# Suggestions for the ordering form. Free text is still accepted — a hospital
# runs tests this list has never heard of, and blocking the order because the
# name is unfamiliar would be the wrong failure.
LAB_TEST_CATALOGUE = (
    ("Complete Blood Count (CBC)", "Haematology", "Blood"),
    ("Erythrocyte Sedimentation Rate (ESR)", "Haematology", "Blood"),
    ("Prothrombin Time / INR", "Haematology", "Blood"),
    ("Blood Glucose — Fasting", "Biochemistry", "Blood"),
    ("Blood Glucose — Postprandial", "Biochemistry", "Blood"),
    ("HbA1c", "Biochemistry", "Blood"),
    ("Lipid Profile", "Biochemistry", "Blood"),
    ("Liver Function Test (LFT)", "Biochemistry", "Blood"),
    ("Renal Function Test (RFT)", "Biochemistry", "Blood"),
    ("Serum Electrolytes", "Biochemistry", "Blood"),
    ("Thyroid Profile (T3, T4, TSH)", "Endocrinology", "Blood"),
    ("Urine Routine & Microscopy", "Pathology", "Urine"),
    ("Urine Culture & Sensitivity", "Microbiology", "Urine"),
    ("Sputum Culture", "Microbiology", "Sputum"),
    ("Blood Culture", "Microbiology", "Blood"),
    ("Dengue NS1 / IgM", "Serology", "Blood"),
    ("Widal Test", "Serology", "Blood"),
    ("COVID-19 RT-PCR", "Microbiology", "Swab"),
    ("Histopathology", "Pathology", "Tissue"),
    ("Biopsy", "Pathology", "Tissue"),
)


class LabRequest(db.Model):
    __tablename__ = "lab_requests"

    id = db.Column(db.Integer, primary_key=True)

    # -- what, and for whom -------------------------------------------------
    patient_id = db.Column(
        db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Both optional: a test can be ordered from a consultation, or standalone
    # for a patient already under treatment.
    consultation_id = db.Column(
        db.Integer, db.ForeignKey("consultations.id"), nullable=True, index=True
    )
    case_id = db.Column(db.Integer, db.ForeignKey("patient_cases.id"), nullable=True)

    test_name = db.Column(db.String(200), nullable=False)
    test_category = db.Column(db.String(100), nullable=True)
    specimen = db.Column(db.String(100), nullable=True)
    priority = db.Column(
        db.Enum(*LAB_PRIORITIES, name="lab_priority"),
        nullable=False,
        default="routine",
        server_default="routine",
    )
    clinical_notes = db.Column(db.Text, nullable=True)

    # -- who ---------------------------------------------------------------
    # Users rather than the doctors/lab profile tables. The doctor who ordered
    # it is a person with a login, not a schedulable clinical resource, and
    # lab technicians have no profile table of their own — adding one would
    # mean touching staff onboarding for no gain here.
    doctor_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    technician_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)

    # -- where it is ---------------------------------------------------------
    status = db.Column(
        db.Enum(*LAB_STATUSES, name="lab_status"),
        nullable=False,
        default="ordered",
        server_default="ordered",
    )

    # A void sample. Kept as a flag alongside the status rather than as a
    # status of its own, because the request really is back at `ordered` —
    # this records *why*, so the doctor sees it was not simply never started.
    recollection_requested = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("0"))
    recollection_reason = db.Column(db.String(500), nullable=True)
    recollection_at = db.Column(db.TIMESTAMP, nullable=True)

    # -- the result ---------------------------------------------------------
    # Stored filename only, like avatars and patient photos. The directory is
    # resolved at read time so a deployment can move storage.
    report_file = db.Column(db.String(255), nullable=True)
    report_original_name = db.Column(db.String(255), nullable=True)
    report_uploaded_at = db.Column(db.TIMESTAMP, nullable=True)
    result_summary = db.Column(db.Text, nullable=True)

    verified_by_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at = db.Column(db.TIMESTAMP, nullable=True)

    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    patient = db.relationship("Patient")
    consultation = db.relationship("Consultation")
    case = db.relationship("PatientCase")
    department = db.relationship("Department")
    # Three columns point at `users`, so each relationship has to say which.
    doctor = db.relationship("User", foreign_keys=[doctor_id])
    technician = db.relationship("User", foreign_keys=[technician_id])
    verified_by = db.relationship("User", foreign_keys=[verified_by_id])

    messages = db.relationship(
        "LabMessage",
        back_populates="lab_request",
        cascade="all, delete-orphan",
        order_by="LabMessage.created_at",
    )

    __table_args__ = (
        # The two listings: a technician's worklist, and a doctor's orders.
        db.Index("idx_lab_technician_status", "technician_id", "status"),
        db.Index("idx_lab_doctor_status", "doctor_id", "status"),
        db.Index("idx_lab_patient_created", "patient_id", "created_at"),
    )

    @property
    def is_open(self):
        """Still needs someone to do something. Drives the worklist counts."""
        return self.status not in ("verified", "cancelled")

    @property
    def has_report(self):
        return bool(self.report_file)

    def participant_ids(self):
        """The two people allowed into this request's discussion.

        Deliberately narrow: the requesting doctor and the assigned
        technician, nobody else. An admin is let through by the route for
        support purposes but is not a participant and is not notified.
        """
        return {uid for uid in (self.doctor_id, self.technician_id) if uid}

    def to_dict(self, include_messages=False):
        patient = self.patient
        data = {
            "id": self.id,
            "patient_id": self.patient_id,
            "patient": patient.name if patient else None,
            "patient_code": patient.code if patient else None,
            "patient_age": patient.age if patient else None,
            "patient_gender": patient.gender if patient else None,
            "consultation_id": self.consultation_id,
            "case_id": self.case_id,
            "test_name": self.test_name,
            "test_category": self.test_category,
            "specimen": self.specimen,
            "priority": self.priority,
            "clinical_notes": self.clinical_notes,
            "doctor_id": self.doctor_id,
            "doctor": self.doctor.name if self.doctor else None,
            "technician_id": self.technician_id,
            "technician": self.technician.name if self.technician else None,
            "assigned": self.technician_id is not None,
            "department_id": self.department_id,
            "department": self.department.name if self.department else None,
            "status": self.status,
            "is_open": self.is_open,
            "recollection_requested": bool(self.recollection_requested),
            "recollection_reason": self.recollection_reason,
            "recollection_at": to_utc_iso(self.recollection_at),
            "has_report": self.has_report,
            "report_name": self.report_original_name,
            "report_uploaded_at": to_utc_iso(self.report_uploaded_at),
            "result_summary": self.result_summary,
            "verified_by": self.verified_by.name if self.verified_by else None,
            "verified_at": to_utc_iso(self.verified_at),
            "message_count": len(self.messages),
            "created_at": to_utc_iso(self.created_at),
            "updated_at": to_utc_iso(self.updated_at),
        }
        if include_messages:
            data["messages"] = [m.to_dict() for m in self.messages]
        return data

    def __repr__(self):
        return f"<LabRequest {self.id} {self.test_name} {self.status}>"


class LabMessage(db.Model):
    """One entry in a lab request's history.

    Two kinds share the table. A `message` is something a person typed; a
    `system` entry is the record of a status change, an upload or a
    recollection. Keeping both in one ordered list is what makes the history
    readable — "sample collected 09:14, doctor asks about fasting 09:20,
    technician replies 09:31" only makes sense interleaved.
    """

    __tablename__ = "lab_messages"

    id = db.Column(db.Integer, primary_key=True)
    lab_request_id = db.Column(
        db.Integer,
        db.ForeignKey("lab_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    kind = db.Column(
        db.Enum("message", "system", name="lab_message_kind"),
        nullable=False,
        default="message",
        server_default="message",
    )
    body = db.Column(db.Text, nullable=False)
    # Append-only: nothing in the application edits or deletes a row here, so
    # the discussion attached to a clinical result stays intact.
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    lab_request = db.relationship("LabRequest", back_populates="messages")
    author = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "body": self.body,
            "author_id": self.author_id,
            "author": self.author.name if self.author else None,
            "author_role": self.author.role.name if self.author and self.author.role else None,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<LabMessage {self.id} {self.kind} req={self.lab_request_id}>"
