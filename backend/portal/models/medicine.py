from datetime import datetime

from portal.extensions import db

# The starting clinical formulary: (name, category, default dose, default
# frequency).
#
# This is what the prescription picker offers and what the AI's suggestions
# are matched against — a consultation ending with an empty `medicines` table
# produces a prescription where every line is flagged off-formulary. Kept
# beside the model for the same reason DEFAULT_ROLES is, and reconciled at
# start-up by `helpers/bootstrap.ensure_medicines`.
#
# Deliberately short. It is a floor that makes the app usable on a fresh
# database, not an attempt at a real hospital's formulary — those arrive
# through the pharmacy catalogue, which nothing here touches.
DEFAULT_FORMULARY = (
    ("Paracetamol 650mg", "Analgesic/Antipyretic", "1 Tablet", "Every 6 hours"),
    ("Vitamin C 500mg", "Supplement", "1 Tablet", "Once Daily"),
    ("Zincovit Tablet", "Supplement", "1 Tablet", "Once Daily"),
    ("ORS", "Rehydration", "1 Sachet", "As needed"),
    ("Cetirizine 10mg", "Antihistamine", "1 Tablet", "Once Daily"),
    ("Amoxicillin 500mg", "Antibiotic", "1 Capsule", "Every 8 hours"),
    ("Ibuprofen 400mg", "NSAID", "1 Tablet", "Every 8 hours"),
    ("Omeprazole 20mg", "Antacid", "1 Capsule", "Once Daily, before food"),
    ("Cough Syrup (Dextromethorphan)", "Antitussive", "10ml", "Every 8 hours"),
)


class Medicine(db.Model):
    __tablename__ = "medicines"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    category = db.Column(db.String(100), nullable=True)
    default_dose = db.Column(db.String(255), nullable=True)
    default_frequency = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "default_dose": self.default_dose,
            "default_frequency": self.default_frequency,
        }

    def __repr__(self):
        return f"<Medicine {self.name}>"
