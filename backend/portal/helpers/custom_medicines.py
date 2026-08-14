"""Turning hand-entered medicines into real catalogue medicines.

A doctor who needs a medicine the catalogue lacks types it in and moves on —
they are treating a patient, not maintaining an inventory. On sign-off, that
medicine is added to their department's catalogue automatically, so the next
doctor with the same presentation finds it in search instead of typing it
again, and the AI can carry it over from the approved case.

Automatic rather than queued for approval, because a queue makes the medicine
useless until somebody clears it — and the decision has in effect already been
made: a doctor prescribed it and signed for it. The pharmacy's job is to
complete the record (category, manufacturer, price, form), not to grant
permission, so each auto-added medicine is also listed for them to refine.

Raised on sign-off rather than on save, for the same reason the knowledge base
learns then: a medicine typed and then removed before the doctor committed was
never actually prescribed.

Callers add to the open session; the caller commits.
"""

from datetime import datetime

from portal.extensions import db
from portal.models.custom_medicine_request import CustomMedicineRequest, normalise_name
from portal.models.medicine_brand import MedicineBrand

# A prescription line carries a route, not a dosage form. This is the closest
# form each route implies, so an auto-added medicine starts with something
# sensible for the pharmacy to correct rather than defaulting everything to
# "tablet".
ROUTE_TO_FORM = {
    "oral": "tablet",
    "injection": "injection",
    "iv": "iv_fluid",
    "topical": "ointment",
    "inhalation": "inhaler",
    "other": "other",
}


def _existing_brand(name):
    """A catalogue medicine already going by this name, if there is one.

    Checked before creating, so two doctors writing the same missing medicine
    produce one catalogue entry rather than a duplicate pair.
    """
    cleaned = normalise_name(name)
    if not cleaned:
        return None
    for brand in MedicineBrand.query.filter(MedicineBrand.brand_name.ilike(name.strip())):
        if normalise_name(brand.brand_name) == cleaned:
            return brand
    return None


def _create_brand(line, department):
    """Builds the catalogue entry for a hand-entered medicine.

    Only what the prescription actually carried is filled in. Category,
    manufacturer and price are left empty rather than guessed — a blank the
    pharmacy fills is honest, an invented value is not.
    """
    brand = MedicineBrand(
        brand_name=(line.medicine_name or "").strip()[:150],
        form=ROUTE_TO_FORM.get(line.route or "", "other"),
        usage_instructions=line.instructions,
        added_by_doctor=True,
        is_active=True,
    )
    # Filed under the prescribing doctor's department. Without one it would
    # belong to no department and be invisible to everybody, including the
    # doctor who just added it.
    brand.departments = [department] if department else []
    brand.for_all_departments = department is None
    db.session.add(brand)
    return brand


def record_from(consultation):
    """Adds each hand-entered medicine to the catalogue, and logs it.

    Returns the entries newly added — not the ones merely counted again — so
    the caller can audit and notify about a genuine addition rather than every
    repeat of one already there.

    The prescription line is linked to the medicine it created, so from this
    point the line is an ordinary catalogue prescription: it resolves in
    search, it can be dispensed against, and the knowledge base can carry it
    over to the next patient with the same presentation. That last part is the
    point — without it, an approved case whose treatment includes a custom
    medicine can never actually be reused.

    A medicine the pharmacy dismissed is not silently re-created: they judged
    it did not belong, and overturning that on the next prescription would
    make the decision meaningless. The count still rises, so a dismissal that
    keeps being contradicted is visible as exactly that.
    """
    doctor = consultation.doctor
    department = doctor.department if doctor else None
    now = datetime.utcnow()
    newly_added = []

    for line in consultation.prescriptions:
        if not line.is_custom:
            continue
        key = normalise_name(line.medicine_name)
        if not key:
            continue

        request = CustomMedicineRequest.query.filter_by(normalized_name=key).first()
        if request is None:
            request = CustomMedicineRequest(
                normalized_name=key[:150],
                medicine_name=(line.medicine_name or "")[:150],
                route=line.route,
                dose=line.dose,
                frequency=line.frequency,
                instructions=line.instructions,
                notes=line.notes,
                requested_by_doctor_id=consultation.doctor_id,
                department_id=department.id if department else None,
                first_requested_at=now,
                times_prescribed=0,
                status="pending",
            )
            db.session.add(request)

        request.times_prescribed = (request.times_prescribed or 0) + 1
        request.last_requested_at = now

        if request.status == "dismissed":
            continue

        brand = request.created_brand or _existing_brand(line.medicine_name)
        if brand is None:
            brand = _create_brand(line, department)
            db.session.flush()  # assigns brand.id for the link below
            request.created_brand_id = brand.id
            newly_added.append((request, brand))
        elif request.created_brand_id is None:
            # The pharmacy already carried it under this name — link the two
            # rather than adding a second entry for the same medicine.
            request.created_brand_id = brand.id

        # From here the line points at a real catalogue medicine, which is
        # what lets a future consultation match and reuse it.
        line.brand_id = brand.id

    return newly_added


def pending_count():
    return CustomMedicineRequest.query.filter_by(status="pending").count()
