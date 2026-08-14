"""The practice's medicine catalogue: what the doctor prescribes from.

Deliberately separate from `medicines`, which is the short clinical formulary
the AI is given as a vocabulary. That table answers "what generic is this";
this one answers "what does the doctor actually write on a prescription" --
a brand, a strength, a form, and how the patient should take it.

`MedicineBrand.medicine_id` is the optional bridge between the two, so a line
written as "Dolo 650" still resolves back to Paracetamol.

No stock, and no branches. A private practice does not hold inventory or
dispense: the patient takes the prescription to whichever pharmacy they use.
This module used to carry a `StockBatch` per hospital branch and gate
prescribing on "is it on our shelf" -- which, in a practice that has no shelf,
would have hidden the entire catalogue from the picker.
"""

from datetime import datetime

from portal.extensions import db
from portal.helpers.datetime_helper import to_utc_iso

# Presentation, not dosage — dosage lives on the prescription.
FORMS = (
    "tablet",
    "capsule",
    "syrup",
    "injection",
    "iv_fluid",
    "ointment",
    "drops",
    "inhaler",
    "sachet",
    "other",
)

FORM_LABELS = {
    "tablet": "Tablet",
    "capsule": "Capsule",
    "syrup": "Syrup",
    "injection": "Injection",
    "iv_fluid": "IV Fluid",
    "ointment": "Ointment / Cream",
    "drops": "Drops",
    "inhaler": "Inhaler",
    "sachet": "Sachet",
    "other": "Other",
}


class MedicineBrand(db.Model):
    """One prescribable product: a brand name, its generic, and what it treats."""

    __tablename__ = "medicine_brands"

    id = db.Column(db.Integer, primary_key=True)
    brand_name = db.Column(db.String(150), nullable=False)
    generic_name = db.Column(db.String(150), nullable=True)
    # Free text the picker searches, e.g. "fever, mild pain, headache".
    used_for = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True)
    manufacturer = db.Column(db.String(150), nullable=True)
    form = db.Column(db.Enum(*FORMS, name="medicine_form"), nullable=False, default="tablet")
    strength = db.Column(db.String(80), nullable=True)
    # How the patient should take it, e.g. "Swallow whole after food; do not
    # crush." Distinct from `used_for`, which is what it treats — this is what
    # gets printed on the prescription alongside the dose.
    usage_instructions = db.Column(db.Text, nullable=True)
    # Indicative price per unit, for the doctor's awareness while prescribing.
    unit_price = db.Column(db.Numeric(10, 2), nullable=True)
    # Created automatically from a doctor's hand-entered prescription line
    # rather than from the seeded catalogue — see helpers/custom_medicines. The
    # flag is kept so the catalogue can show which entries came in that way and
    # still want a category and manufacturer filling in.
    added_by_doctor = db.Column(db.Boolean, nullable=False, default=False)
    # The clinical formulary row this brand dispenses, when there is one.
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True)
    # Retired medicines stay on file so old prescriptions still read correctly;
    # they are simply not offered in the picker any more.
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    medicine = db.relationship("Medicine")

    __table_args__ = (
        # A brand name is only unique together with its strength — the same
        # brand ships as 250mg and 500mg, and they are different products.
        db.UniqueConstraint("brand_name", "strength", name="uq_brand_strength"),
        db.Index("idx_brand_name", "brand_name"),
    )

    @property
    def form_label(self):
        return FORM_LABELS.get(self.form, self.form)

    @property
    def display_name(self):
        return f"{self.brand_name} {self.strength}".strip() if self.strength else self.brand_name

    def availability(self):
        """One word for whether this medicine may still be prescribed."""
        return "available" if self.is_active else "discontinued"

    def to_dict(self):
        return {
            "id": self.id,
            "brand_name": self.brand_name,
            "display_name": self.display_name,
            "generic_name": self.generic_name,
            "used_for": self.used_for,
            "usage_instructions": self.usage_instructions,
            "category": self.category,
            "manufacturer": self.manufacturer,
            "form": self.form,
            "form_label": self.form_label,
            "strength": self.strength,
            "unit_price": float(self.unit_price) if self.unit_price is not None else None,
            "is_active": self.is_active,
            "added_by_doctor": self.added_by_doctor,
            "medicine_id": self.medicine_id,
            "formulary_name": self.medicine.name if self.medicine else None,
            "availability": self.availability(),
            "created_at": to_utc_iso(self.created_at),
        }

    def __repr__(self):
        return f"<MedicineBrand {self.display_name}>"
