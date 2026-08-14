"""Free-text nursing record: routine notes and end-of-shift handovers.

A handover is the same row with `note_type='handover'` and the incoming nurse
named, so the timeline reads in one sequence instead of splitting the story
across two tables.
"""

from datetime import datetime

from portal.extensions import db
from portal.models.types import PRECISE_DATETIME, PRECISE_TIMESTAMP
from portal.helpers.datetime_helper import to_utc_iso
from portal.models.nurse import SHIFTS

NOTE_TYPES = ("note", "handover")


class NursingNote(db.Model):
    __tablename__ = "nursing_notes"

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(
        db.Integer,
        db.ForeignKey("nursing_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    nurse_id = db.Column(db.Integer, db.ForeignKey("nurses.id"), nullable=False)
    note_type = db.Column(
        db.Enum(*NOTE_TYPES, name="nursing_note_type"), nullable=False, default="note"
    )
    shift = db.Column(db.Enum(*SHIFTS, name="nursing_note_shift"), nullable=True)
    content = db.Column(db.Text, nullable=False)
    # Who the shift was handed to. Null on a plain note, and also on a handover
    # where the next nurse wasn't known yet.
    handover_to_nurse_id = db.Column(db.Integer, db.ForeignKey("nurses.id"), nullable=True)
    created_at = db.Column(
        PRECISE_TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow
    )

    assignment = db.relationship("NursingAssignment", back_populates="notes")
    nurse = db.relationship("Nurse", foreign_keys=[nurse_id])
    handover_to = db.relationship("Nurse", foreign_keys=[handover_to_nurse_id])

    __table_args__ = (
        db.Index("idx_nursing_notes_assignment_created", "assignment_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "note_type": self.note_type,
            "shift": self.shift,
            "content": self.content,
            "nurse_id": self.nurse_id,
            "nurse": self.nurse.user.name if self.nurse and self.nurse.user else None,
            "handover_to_nurse_id": self.handover_to_nurse_id,
            "handover_to": (
                self.handover_to.user.name
                if self.handover_to and self.handover_to.user
                else None
            ),
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<NursingNote {self.id} {self.note_type}>"
