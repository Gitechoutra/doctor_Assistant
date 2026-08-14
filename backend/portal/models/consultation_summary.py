from datetime import datetime

import json

from portal.extensions import db


class ConsultationSummary(db.Model):
    __tablename__ = "consultation_summaries"

    id = db.Column(db.Integer, primary_key=True)
    consultation_id = db.Column(
        db.Integer, db.ForeignKey("consultations.id"), nullable=False, unique=True
    )
    summary = db.Column(db.Text, nullable=True)
    symptoms = db.Column(db.Text, nullable=True)
    possible_diagnosis = db.Column(db.Text, nullable=True)
    follow_up_advice = db.Column(db.Text, nullable=True)
    lifestyle_advice = db.Column(db.Text, nullable=True)
    # JSON-encoded [{"speaker": "doctor"|"patient", "text": "..."}, ...] —
    # Gemini's best-effort reconstruction of who said what, since capture no
    # longer requires the doctor to manually tag speakers while recording.
    labeled_transcript = db.Column(db.Text, nullable=True)
    # JSON snapshot of the doctor-approved precedents the AI was shown when it
    # produced this summary: [{"precedent_id", "similarity", "diagnosis",
    # "symptoms", "doctor", "approved_at", "medicines"}, ...]
    #
    # A snapshot, not a list of ids to look up later: this records what
    # informed *this* prescription, and it must keep saying so even after a
    # precedent is retired or the knowledge base moves on.
    matched_precedents = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    consultation = db.relationship("Consultation", back_populates="summary", uselist=False)

    @property
    def precedent_list(self):
        try:
            return json.loads(self.matched_precedents or "[]")
        except (TypeError, ValueError):
            return []

    def to_dict(self):
        return {
            "summary": self.summary,
            "symptoms": self.symptoms,
            "possible_diagnosis": self.possible_diagnosis,
            # Stored as newline-joined text; split back into a list for the UI.
            "follow_up_advice": (self.follow_up_advice or "").splitlines(),
            "lifestyle_advice": (self.lifestyle_advice or "").splitlines(),
            "labeled_transcript": json.loads(self.labeled_transcript) if self.labeled_transcript else [],
            # Why the AI suggested what it did — the doctor reviewing a
            # suggestion is entitled to see which approved cases it came from.
            "matched_precedents": self.precedent_list,
        }

    def __repr__(self):
        return f"<ConsultationSummary {self.consultation_id}>"
