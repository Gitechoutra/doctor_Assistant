"""The pharmacy catalogue, and what each branch actually holds.

Deliberately separate from `medicines`, which is the clinical formulary the AI
prescribes from. That table answers "what may a doctor prescribe"; these answer
"what is on the shelf, and where". Merging them would let a sold-out brand
disappear from the formulary, or a discontinued brand keep being suggested.

`MedicineBrand.medicine_id` is the optional bridge: a brand can be tied to the
generic it dispenses, so a prescription for "Paracetamol 650mg" can be filled
with whichever brand the counter stocks.
"""

from datetime import date, datetime

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

DEFAULT_REORDER_LEVEL = 20

# Which departments stock a medicine. A plain link table rather than a column
# on the brand, because the real relationship is many-to-many: Paracetamol is
# used by every department while Oxytocin is used by one, and a single
# department_id would force the shared ones to be duplicated per department or
# hidden from most of the hospital.
medicine_departments = db.Table(
    "medicine_departments",
    db.Column(
        "brand_id",
        db.Integer,
        db.ForeignKey("medicine_brands.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    db.Column(
        "department_id",
        db.Integer,
        db.ForeignKey("departments.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    # `department_id` is the second column of the composite primary key, so
    # MySQL/InnoDB additionally creates its own single-column index to back
    # the foreign key (a leading-column PK index doesn't satisfy that on its
    # own). Declared explicitly so autogenerate can see it — otherwise it
    # looks like an untracked index and `flask db migrate` proposes to drop
    # it, which MySQL then refuses because the FK still needs it.
    db.Index("ix_medicine_departments_department", "department_id"),
)


class MedicineBrand(db.Model):
    """One purchasable product: a brand name, its generic, and what it treats."""

    __tablename__ = "medicine_brands"

    id = db.Column(db.Integer, primary_key=True)
    brand_name = db.Column(db.String(150), nullable=False)
    generic_name = db.Column(db.String(150), nullable=True)
    # The whole point of the "what is it used for" field: free text a
    # pharmacist can search, e.g. "fever, mild pain, headache".
    used_for = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True)
    manufacturer = db.Column(db.String(150), nullable=True)
    form = db.Column(db.Enum(*FORMS, name="medicine_form"), nullable=False, default="tablet")
    strength = db.Column(db.String(80), nullable=True)
    # Below this total quantity in a branch, the brand shows up in Low Stock.
    # Held on the brand rather than per branch: one sensible threshold per
    # product is enough until branches genuinely need different ones.
    reorder_level = db.Column(db.Integer, nullable=False, default=DEFAULT_REORDER_LEVEL)
    # How the patient should take it, e.g. "Swallow whole after food; do not
    # crush." Distinct from `used_for`, which is what it treats — this is what
    # gets printed on the label and suggested alongside a prescription.
    usage_instructions = db.Column(db.Text, nullable=True)
    # The catalogue list price per unit. A batch's `mrp` is what one delivery
    # was priced at and is what a sale should charge; this is the standing
    # price shown while managing the medicine, before any stock exists.
    unit_price = db.Column(db.Numeric(10, 2), nullable=True)
    # True for stock every department draws on (analgesics, IV fluids), so
    # general items do not have to be tagged to a dozen departments one by one
    # and stay correct when a new department is opened.
    for_all_departments = db.Column(db.Boolean, nullable=False, default=False)
    # Created automatically from a doctor's hand-entered prescription line
    # rather than by the pharmacy.
    #
    # Two things follow. It is offered for prescribing even with no stock —
    # the pharmacy has not bought it yet, and the patient sources it outside,
    # which is exactly why the doctor typed it in. And it is listed for the
    # pharmacy to complete, since a name and dosing is all a prescription
    # carries: no category, manufacturer or price.
    added_by_doctor = db.Column(db.Boolean, nullable=False, default=False)
    # The clinical formulary row this brand dispenses, when there is one.
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    medicine = db.relationship("Medicine")
    departments = db.relationship(
        "Department",
        secondary=medicine_departments,
        lazy="selectin",
        order_by="Department.name",
    )
    batches = db.relationship(
        "StockBatch", back_populates="brand", cascade="all, delete-orphan"
    )

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

    def quantity_in(self, branch_id):
        """Total sellable units in one branch — expired batches excluded, since
        stock you cannot dispense is not stock."""
        today = datetime.utcnow().date()
        return sum(
            b.quantity
            for b in self.batches
            if b.branch_id == branch_id and (b.expiry_date is None or b.expiry_date >= today)
        )

    @property
    def total_quantity(self):
        """Sellable units across the whole hospital.

        What "available to prescribe" means: a doctor writes for the hospital,
        not for one counter, and a medicine held at another branch can be
        transferred. Per-branch numbers are the pharmacist's view.
        """
        today = datetime.utcnow().date()
        return sum(
            b.quantity
            for b in self.batches
            if b.expiry_date is None or b.expiry_date >= today
        )

    @property
    def nearest_expiry(self):
        """The soonest expiry among batches still holding stock — the date that
        actually constrains dispensing."""
        dates = [b.expiry_date for b in self.batches if b.quantity > 0 and b.expiry_date]
        return min(dates) if dates else None

    def availability(self, branch_id=None):
        """One word for the state of this medicine, in the order that matters.

        Discontinued outranks everything: an inactive brand is not "in stock"
        regardless of what is still sitting on the shelf, because it must not
        be dispensed or prescribed.
        """
        if not self.is_active:
            return "discontinued"
        quantity = self.quantity_in(branch_id) if branch_id is not None else self.total_quantity
        if quantity <= 0:
            # A doctor-added medicine the pharmacy has not stocked is not the
            # same as one they carry and have run out of. Saying "out of
            # stock" would suggest waiting for a delivery that was never
            # ordered; the patient buys this one outside.
            return "not_stocked" if self.added_by_doctor else "out_of_stock"
        if quantity < self.reorder_level:
            return "low_stock"
        return "available"

    def to_dict(self, branch_id=None, include_batches=False):
        nearest = self.nearest_expiry
        data = {
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
            "reorder_level": self.reorder_level,
            "is_active": self.is_active,
            "for_all_departments": self.for_all_departments,
            "added_by_doctor": self.added_by_doctor,
            "departments": [
                {"id": d.id, "name": d.name} for d in self.departments
            ],
            "department_ids": [d.id for d in self.departments],
            "medicine_id": self.medicine_id,
            "formulary_name": self.medicine.name if self.medicine else None,
            # Hospital-wide, so a doctor's department view and the pharmacy's
            # counter view can both be shown without a second request.
            "total_quantity": self.total_quantity,
            "nearest_expiry": nearest.isoformat() if nearest else None,
            "availability": self.availability(branch_id),
            "created_at": to_utc_iso(self.created_at),
        }
        if branch_id is not None:
            quantity = self.quantity_in(branch_id)
            data["quantity"] = quantity
            data["in_stock"] = quantity > 0
            data["low_stock"] = 0 < quantity < self.reorder_level
        if include_batches:
            data["batches"] = [
                b.to_dict()
                for b in sorted(
                    (x for x in self.batches if branch_id is None or x.branch_id == branch_id),
                    # Nearest expiry first: that is the batch to dispense next.
                    key=lambda x: (x.expiry_date or date.max),
                )
            ]
        return data

    def serves_department(self, department_id):
        if self.for_all_departments:
            return True
        return any(d.id == department_id for d in self.departments)

    def __repr__(self):
        return f"<MedicineBrand {self.display_name}>"


class StockBatch(db.Model):
    """A batch of one brand held at one branch.

    Batch-level rather than a single running total, because expiry and cost
    are properties of a delivery, not of a product. A branch's quantity is the
    sum of its unexpired batches.
    """

    __tablename__ = "stock_batches"

    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"), nullable=False)
    brand_id = db.Column(
        db.Integer, db.ForeignKey("medicine_brands.id", ondelete="CASCADE"), nullable=False
    )
    batch_no = db.Column(db.String(60), nullable=True)
    expiry_date = db.Column(db.Date, nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=0)
    # Numeric, not Float: money that rounds badly is money that goes missing.
    mrp = db.Column(db.Numeric(10, 2), nullable=True)
    cost_price = db.Column(db.Numeric(10, 2), nullable=True)
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP,
        server_default=db.func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    branch = db.relationship("Branch")
    brand = db.relationship("MedicineBrand", back_populates="batches")

    __table_args__ = (
        db.Index("idx_stock_branch_brand", "branch_id", "brand_id"),
        db.Index("idx_stock_expiry", "expiry_date"),
    )

    @property
    def is_expired(self):
        return bool(self.expiry_date and self.expiry_date < datetime.utcnow().date())

    @property
    def days_to_expiry(self):
        if not self.expiry_date:
            return None
        return (self.expiry_date - datetime.utcnow().date()).days

    def to_dict(self):
        return {
            "id": self.id,
            "branch_id": self.branch_id,
            "branch": self.branch.name if self.branch else None,
            "brand_id": self.brand_id,
            "brand_name": self.brand.display_name if self.brand else None,
            "batch_no": self.batch_no,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "days_to_expiry": self.days_to_expiry,
            "is_expired": self.is_expired,
            "quantity": self.quantity,
            "mrp": float(self.mrp) if self.mrp is not None else None,
            "cost_price": float(self.cost_price) if self.cost_price is not None else None,
        }

    def __repr__(self):
        return f"<StockBatch brand={self.brand_id} branch={self.branch_id} qty={self.quantity}>"
