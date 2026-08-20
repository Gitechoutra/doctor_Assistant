import json
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
    # JSON-encoded [{"speaker": "doctor"|"patient", "text": "..."}, ...] — the
    # same recording laid out as the conversation it was, so the doctor reads
    # turns rather than one unbroken block of prose while the visit is still
    # happening.
    #
    # Presentation only, and deliberately additive: `message` above is still
    # the whole take verbatim and is still what the end-of-consultation summary
    # and prescription are generated from. Nothing clinical reads this column,
    # so a split that fails or comes back doubtful costs the doctor a nicer
    # layout and nothing else — it stays NULL and the take shows unsplit.
    speaker_turns = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    consultation = db.relationship("Consultation", back_populates="messages")

    @property
    def turn_list(self):
        try:
            return json.loads(self.speaker_turns or "[]")
        except (TypeError, ValueError):
            return []

    def to_dict(self):
        return {
            "id": self.id,
            "speaker": self.speaker,
            "message": self.message,
            # Empty whenever the split was not available — the client falls
            # back to rendering `message` as it always did.
            "turns": self.turn_list,
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<ConversationMessage {self.id} {self.speaker}>"
