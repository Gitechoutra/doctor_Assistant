from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso


class ConversationMessage(db.Model):
    __tablename__ = "conversation_messages"

    id = db.Column(db.Integer, primary_key=True)
    consultation_id = db.Column(db.Integer, db.ForeignKey("consultations.id"), nullable=False)
    # "unknown" covers segments captured during continuous recording, where the
    # doctor isn't manually tagging who's speaking as they talk. Gemini infers
    # the doctor/patient split from context when the consultation ends.
    speaker = db.Column(
        db.Enum("doctor", "patient", "unknown", name="message_speaker"), nullable=False
    )
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    consultation = db.relationship("Consultation", back_populates="messages")

    def to_dict(self):
        return {
            "id": self.id,
            "speaker": self.speaker,
            "message": self.message,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<ConversationMessage {self.id} {self.speaker}>"
