"""A doctor handing a patient to a nurse for the observation period.

After a consultation, surgery or procedure the doctor names the nurse who
will watch the patient for the next couple of days. That assignment is what
scopes everything else in the nursing module: a nurse sees exactly the
patients they hold an active assignment for, and every medication log,
observation, note and alert hangs off one of these rows.
"""

from datetime import datetime

from portal.extensions import db
from portal.models.types import PRECISE_DATETIME, PRECISE_TIMESTAMP
from portal.helpers.datetime_helper import to_utc_iso

CARE_TYPES = ("observation", "post_surgery", "post_procedure", "recovery", "icu")
ASSIGNMENT_STATUSES = ("active", "completed", "cancelled")


class NursingAssignment(db.Model):
    __tablename__ = "nursing_assignments"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    nurse_id = db.Column(db.Integer, db.ForeignKey("nurses.id"), nullable=False)
    # The doctor who is responsible for the patient and for this hand-off.
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=False)
    # The visit this recovery period follows, when there was one. Optional
    # because a nurse can also be assigned for a procedure booked outside the
    # consultation flow.
    consultation_id = db.Column(
        db.Integer, db.ForeignKey("consultations.id"), nullable=True
    )
    # The emergency episode this hand-off came out of, when there was one. An
    # emergency patient never has a Consultation (see `EmergencyCase`'s module
    # docstring), so without this the nurse's record has no way to say where
    # the patient came from or why — and the medicines on the schedule read as
    # an ordinary post-op course rather than emergency orders.
    emergency_case_id = db.Column(
        db.Integer, db.ForeignKey("emergency_cases.id"), nullable=True
    )

    care_type = db.Column(
        db.Enum(*CARE_TYPES, name="nursing_care_type"),
        nullable=False,
        default="observation",
    )
    # What the doctor wants done: the treatment plan in the doctor's words,
    # plus standing instructions the nurse works from each shift.
    treatment_plan = db.Column(db.Text, nullable=True)
    care_instructions = db.Column(db.Text, nullable=True)

    starts_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    # The date the doctor expects to stop watching. Purely an expectation:
    # nothing closes an assignment when it passes, and passing it is not
    # flagged. Care ends only when the nurse or the treating doctor says so,
    # because a patient still unwell on day four is still the nurse's patient.
    ends_at = db.Column(db.DateTime, nullable=True)

    status = db.Column(
        db.Enum(*ASSIGNMENT_STATUSES, name="nursing_assignment_status"),
        nullable=False,
        default="active",
    )
    completed_at = db.Column(db.DateTime, nullable=True)
    # When the treating doctor last opened this record. Everything the nurse
    # logged after it counts as unreviewed, which is what puts the "3 new"
    # badge on the doctor's monitor. Stored rather than derived from the
    # notification table: a doctor who clears their bell without opening the
    # record has not reviewed anything.
    doctor_seen_at = db.Column(PRECISE_DATETIME, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP, server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    patient = db.relationship("Patient")
    nurse = db.relationship("Nurse")
    doctor = db.relationship("Doctor")
    consultation = db.relationship("Consultation")
    emergency_case = db.relationship("EmergencyCase")

    medication_orders = db.relationship(
        "MedicationOrder",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="MedicationOrder.id",
    )
    administrations = db.relationship(
        "MedicationAdministration",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="MedicationAdministration.created_at.desc()",
    )
    observations = db.relationship(
        "PatientObservation",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="PatientObservation.recorded_at.desc()",
    )
    notes = db.relationship(
        "NursingNote",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="NursingNote.created_at.desc()",
    )
    alerts = db.relationship(
        "ClinicalAlert",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="ClinicalAlert.created_at.desc()",
    )
    # Oldest first: a conversation reads top-to-bottom, unlike the record
    # panels above, which lead with the most recent entry.
    messages = db.relationship(
        "CareMessage",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="CareMessage.created_at",
    )

    __table_args__ = (
        # Both list views ask the same shape of question: "my active
        # assignments, newest first".
        db.Index("idx_nursing_assignments_nurse_status", "nurse_id", "status"),
        db.Index("idx_nursing_assignments_doctor_status", "doctor_id", "status"),
    )

    @property
    def open_alert_count(self):
        return sum(1 for a in self.alerts if a.status == "open")

    def nursing_activity(self):
        """Every entry the nurse has made, as (timestamp, kind, summary).

        The single definition of "a nursing update" — the unreviewed count, the
        cross-patient feed and the per-record timeline all read from here, so
        none of them can drift from the others about what counts.
        """
        events = []
        for record in self.administrations:
            events.append(
                (
                    record.administered_at or record.created_at,
                    "medication",
                    f"{record.medicine_name} — {record.status}",
                )
            )
        for observation in self.observations:
            events.append(
                (
                    observation.recorded_at or observation.created_at,
                    "observation",
                    "Abnormal observation" if observation.is_abnormal else "Observation recorded",
                )
            )
        for note in self.notes:
            events.append(
                (
                    note.created_at,
                    note.note_type,
                    "Shift handover" if note.note_type == "handover" else "Nursing note",
                )
            )
        for alert in self.alerts:
            events.append((alert.created_at, "alert", alert.message))
        for message in self.messages:
            # Only the nurse's side: the doctor's own messages are not an
            # update *to* the doctor.
            if message.sender_role == "nurse":
                events.append((message.created_at, "message", message.body))
        return [e for e in events if e[0] is not None]

    def unreviewed_count(self):
        """How much the nurse has logged since the doctor last opened this.

        A strict `>` is only meaningful because both sides carry microseconds
        (see models/types.py). On second-resolution columns an entry written in
        the same second as the review would be indistinguishable from one
        written just before it, and the badge would either stick or drop
        genuine updates.
        """
        if self.doctor_seen_at is None:
            return len(self.nursing_activity())
        return sum(
            1 for at, _kind, _summary in self.nursing_activity() if at > self.doctor_seen_at
        )

    def last_activity_at(self):
        stamps = [at for at, _kind, _summary in self.nursing_activity()]
        return max(stamps) if stamps else None

    def unread_messages_for(self, user_id):
        """Messages on this thread the given user hasn't opened.

        Takes a user id rather than reading the request, so the model stays
        usable from a shell or a background job.
        """
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return 0
        return sum(
            1 for m in self.messages if m.read_at is None and m.sender_id != user_id
        )

    def compliance(self):
        """Medication compliance over the whole assignment.

        Counted from what the nurse actually logged, because a dose nobody
        recorded is not evidence of anything — 'missed' and 'skipped' are
        deliberate entries, not gaps.
        """
        counts = {"completed": 0, "delayed": 0, "missed": 0, "skipped": 0}
        for record in self.administrations:
            if record.status in counts:
                counts[record.status] += 1
        total = sum(counts.values())
        # Delayed doses were still given, so they count as taken; only missed
        # and skipped are a break in the course.
        given = counts["completed"] + counts["delayed"]
        return {
            **counts,
            "total": total,
            "rate": round(given / total * 100) if total else None,
        }

    def emergency_context(self, include_detail=False):
        """The emergency episode behind this assignment, or None.

        Served inside the assignment payload rather than left to the nurse's
        screen to fetch, because `/emergency/<id>` is doctor/reception/admin
        only — a nurse has no route of their own to the case. What they need
        from it is exactly what a handover would say out loud: what came in,
        how bad, when, and what the doctor decided to do about it.

        The detail half (the doctor's own assessment and what was given before
        the patient reached the ward) is only on the record view; a ward list
        card has no room for it and would only truncate it misleadingly.
        """
        case = self.emergency_case
        if not case:
            return None

        context = {
            "id": case.id,
            "code": case.code,
            "severity": case.severity,
            "status": case.status,
            "reason": case.reason,
            "decision": case.decision,
            "arrived_at": to_utc_iso(case.arrived_at),
        }
        if include_detail:
            context.update(
                {
                    "department": case.department.name if case.department else None,
                    "doctor": (
                        case.doctor.user.name if case.doctor and case.doctor.user else None
                    ),
                    "registered_by": (
                        case.registered_by.name if case.registered_by else None
                    ),
                    "assessment_notes": case.assessment_notes,
                    "treatment_notes": case.treatment_notes,
                    "assessed_at": to_utc_iso(case.assessed_at),
                    "resolved_at": to_utc_iso(case.resolved_at),
                }
            )
        return context

    def to_dict(self, include_detail=False, viewer_id=None, for_doctor=False):
        """`viewer_id` adds that user's unread message count -- the badge is
        per-person, so it can't be baked into a shared payload.

        `for_doctor` adds the unreviewed-activity count. Only meaningful for
        the treating doctor: `doctor_seen_at` tracks one person, so showing
        the number to a nurse would be showing them someone else's badge.
        """
        data = {
            "id": self.id,
            "patient_id": self.patient_id,
            "patient": self.patient.name if self.patient else None,
            "patient_code": self.patient.code if self.patient else None,
            "patient_photo_url": self.patient.photo_url if self.patient else None,
            "nurse_id": self.nurse_id,
            "nurse": self.nurse.user.name if self.nurse and self.nurse.user else None,
            "doctor_id": self.doctor_id,
            "doctor": self.doctor.user.name if self.doctor and self.doctor.user else None,
            "consultation_id": self.consultation_id,
            "emergency_case_id": self.emergency_case_id,
            # Present on the list payload too: a nurse's ward list mixes
            # emergency admissions in with routine post-op patients, and
            # which is which has to be readable without opening the card.
            "emergency": self.emergency_context(),
            "care_type": self.care_type,
            # Where the patient is on the surgical pathway. Carried on the
            # assignment because both ward lists render from this payload and
            # both need to distinguish "still to be operated on" from "under
            # observation" from "observation finished" without a second fetch.
            "surgery_stage": self.patient.surgery_stage if self.patient else None,
            "observation_ends_at": (
                to_utc_iso(self.patient.observation_ends_at) if self.patient else None
            ),
            "observation_days_left": (
                self.patient.observation_days_left if self.patient else None
            ),
            "status": self.status,
            "starts_at": to_utc_iso(self.starts_at),
            "ends_at": to_utc_iso(self.ends_at),
            "completed_at": to_utc_iso(self.completed_at),
            "created_at": to_utc_iso(self.created_at),
            "open_alerts": self.open_alert_count,
            "unread_messages": self.unread_messages_for(viewer_id) if viewer_id else 0,
            "unreviewed_updates": self.unreviewed_count() if for_doctor else 0,
            "doctor_seen_at": to_utc_iso(self.doctor_seen_at),
            "last_activity_at": to_utc_iso(self.last_activity_at()),
            "compliance": self.compliance(),
        }

        if include_detail:
            data["emergency"] = self.emergency_context(include_detail=True)
            data["patient_detail"] = self.patient.to_dict() if self.patient else None
            data["treatment_plan"] = self.treatment_plan
            data["care_instructions"] = self.care_instructions
            data["medication_orders"] = [o.to_dict() for o in self.medication_orders]
            data["administrations"] = [a.to_dict() for a in self.administrations]
            data["observations"] = [o.to_dict() for o in self.observations]
            data["notes"] = [n.to_dict() for n in self.notes]
            data["alerts"] = [a.to_dict() for a in self.alerts]
            data["messages"] = [m.to_dict() for m in self.messages]
            # The doctor's own record of the visit — the nurse reads it, never
            # edits it, so it is served straight from the consultation.
            data["consultation"] = (
                {
                    "id": self.consultation.id,
                    "summary": (
                        self.consultation.summary.to_dict()
                        if self.consultation.summary
                        else None
                    ),
                    "prescriptions": [
                        p.to_dict() for p in self.consultation.prescriptions
                    ],
                    "prescription_verified": (
                        self.consultation.prescription_verified_at is not None
                    ),
                    "ended_at": to_utc_iso(self.consultation.ended_at),
                }
                if self.consultation
                else None
            )

        return data

    def __repr__(self):
        return f"<NursingAssignment {self.id} patient={self.patient_id} nurse={self.nurse_id}>"
