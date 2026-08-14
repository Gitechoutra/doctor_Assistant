"""What a doctor may prescribe, and how a suggested name resolves back to it.

Prescribing draws on the pharmacy's own inventory rather than a separate list:
a doctor's department's medicines, active, and actually in stock somewhere in
the hospital. That is what makes a prescription fillable — a suggestion for
something the pharmacy does not carry wastes the patient's trip to the counter.

"In stock" is hospital-wide, not per branch. A doctor writes for the hospital;
which counter holds the units is the pharmacist's problem to solve, and they
can already see and transfer across branches.

Two things live here so every prescribing path agrees:

  prescribable_for  the list offered to the AI and to the doctor
  resolve_medicine  a name coming back from the AI or typed by the doctor,
                    matched to the catalogue item it refers to

Departments matter because the same catalogue serves all of them: a
gynaecologist should be offered obstetric drugs and general analgesics, not
the oncology shelf.
"""

from portal.extensions import db
from portal.models.medicine import Medicine
from portal.models.medicine_brand import MedicineBrand, medicine_departments

# Sent with each medicine so the AI can dose it sensibly without inventing.
MAX_FORMULARY_ITEMS = 400


def department_brands(department_id, include_out_of_stock=False, active_only=True):
    """Catalogue items this department prescribes from.

    A brand qualifies by being tagged to the department, or by being marked
    for all departments — which is how shared stock (analgesics, IV fluids)
    reaches every department without being tagged to each one by hand.

    With no department (an admin, or a doctor with none set) the whole active
    catalogue is returned rather than nothing: showing an empty formulary
    would look like the pharmacy is bare.
    """
    query = MedicineBrand.query
    if active_only:
        query = query.filter(MedicineBrand.is_active.is_(True))

    if department_id:
        query = query.filter(
            db.or_(
                MedicineBrand.for_all_departments.is_(True),
                MedicineBrand.id.in_(
                    db.session.query(medicine_departments.c.brand_id).filter(
                        medicine_departments.c.department_id == department_id
                    )
                ),
            )
        )

    brands = query.order_by(MedicineBrand.brand_name).all()
    if include_out_of_stock:
        return brands
    # Filtered in Python rather than SQL: stock is the sum of a brand's
    # unexpired batches, and expressing "unexpired" as a join here would
    # duplicate the rule that already lives on the model.
    #
    # Doctor-added medicines are kept regardless. The pharmacy never bought
    # them — a doctor entered one because the hospital does not carry it, and
    # the patient sources it outside. Applying the stock rule would drop the
    # medicine straight back out of reach the moment it was added, which is
    # precisely the gap manual entry exists to close.
    return [b for b in brands if b.total_quantity > 0 or b.added_by_doctor]


def prescribable_for(doctor, include_out_of_stock=False):
    """The prescribable list for a doctor's department."""
    department_id = doctor.department_id if doctor else None
    return department_brands(department_id, include_out_of_stock=include_out_of_stock)


def formulary_payload(brands):
    """The catalogue as the AI sees it.

    `name` is the display name (brand plus strength), because that is what a
    prescription has to say to be dispensable — "Paracetamol" alone leaves the
    counter guessing between 500mg and 650mg.
    """
    payload = []
    for brand in brands[:MAX_FORMULARY_ITEMS]:
        payload.append(
            {
                "name": brand.display_name,
                "generic_name": brand.generic_name,
                "category": brand.category,
                "form": brand.form_label,
                "used_for": brand.used_for,
                "default_dose": brand.usage_instructions,
                "in_stock": brand.total_quantity,
            }
        )
    return payload


def _index(brands):
    """Every name a brand can plausibly be written as, lowered."""
    index = {}
    for brand in brands:
        for key in filter(None, (brand.display_name, brand.brand_name, brand.generic_name)):
            index.setdefault(key.strip().lower(), brand)
    return index


def resolve_medicine(name, brands, formulary_by_name=None):
    """Matches a prescribed name to what the hospital holds.

    Returns `(brand, medicine_id)`. Tried in order of how specific the match
    is: the exact display name, then the brand or generic on its own, then a
    containment match for a name written with extra words around it.

    Falls back to the older clinical formulary so a prescription written
    before the pharmacy inventory existed — or copied from a stored precedent —
    still resolves to something rather than being flagged off-formulary.
    """
    cleaned = (name or "").strip().lower()
    if not cleaned:
        return None, None

    index = _index(brands)
    brand = index.get(cleaned)

    if brand is None:
        # "Tab. Dolo 650 (Paracetamol)" should still find Dolo 650. Longest
        # key first, so a specific strength wins over the bare brand name.
        for key in sorted(index, key=len, reverse=True):
            if key and key in cleaned:
                brand = index[key]
                break

    if brand is not None:
        return brand, brand.medicine_id

    if formulary_by_name is None:
        formulary_by_name = {m.name.lower(): m for m in Medicine.query.all()}
    legacy = formulary_by_name.get(cleaned)
    return None, legacy.id if legacy else None
