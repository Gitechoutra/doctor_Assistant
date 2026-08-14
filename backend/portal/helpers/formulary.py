"""What the doctor may prescribe, and how a suggested name resolves back to it.

Two things live here so every prescribing path agrees:

  prescribable      the list offered to the AI and to the doctor
  resolve_medicine  a name coming back from the AI or typed by the doctor,
                    matched to the catalogue item it refers to

The catalogue is the practice's own, and it is offered whole. The hospital
version narrowed it two ways that a private practice cannot support: by
department, which no longer exists, and by "is it in stock", which asked
whether the hospital pharmacy held units. A practice dispenses nothing -- the
patient takes the prescription to whichever chemist they use -- so gating the
picker on stock would have shown the doctor an empty formulary and left them
hand-typing every line.
"""

from portal.models.medicine import Medicine
from portal.models.medicine_brand import MedicineBrand

# Sent with each medicine so the AI can dose it sensibly without inventing.
MAX_FORMULARY_ITEMS = 400


def prescribable(active_only=True):
    """The practice's prescribable catalogue, alphabetically."""
    query = MedicineBrand.query
    if active_only:
        query = query.filter(MedicineBrand.is_active.is_(True))
    return query.order_by(MedicineBrand.brand_name).all()


def prescribable_for(doctor=None, active_only=True):
    """The prescribable list for a doctor.

    `doctor` is accepted and ignored: one practice, one catalogue. Kept in the
    signature because every caller has a doctor in hand and because a practice
    with two doctors and two formularies is the change this would grow into.
    """
    return prescribable(active_only=active_only)


def formulary_payload(brands):
    """The catalogue as the AI sees it.

    `name` is the display name (brand plus strength), because that is what a
    prescription has to say to be dispensable — "Paracetamol" alone leaves the
    chemist guessing between 500mg and 650mg.
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
    """Matches a prescribed name to the catalogue item it refers to.

    Returns `(brand, medicine_id)`. Tried in order of how specific the match
    is: the exact display name, then the brand or generic on its own, then a
    containment match for a name written with extra words around it.

    Falls back to the short clinical formulary so a prescription copied from a
    stored precedent still resolves to something rather than being flagged
    off-formulary.
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
