"""The pharmacy counter's API.

Everything is scoped to the pharmacist's own branch, with one deliberate
exception: cross-branch lookup. A pharmacist may see *that* another branch
holds a medicine and how many, so they can arrange a transfer -- they cannot
touch that stock. Reading a neighbour's shelf is the whole point; writing to
it is not theirs to do.
"""

from datetime import date, datetime, timedelta

from flask import Blueprint, request
from flask_jwt_extended import get_jwt, get_jwt_identity

from portal.extensions import db
from portal.helpers.audit import (
    CUSTOM_MEDICINE_ADDED,
    CUSTOM_MEDICINE_DISMISSED,
    audit,
)
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.decorators import role_required
from portal.helpers.notify import notify
from portal.helpers.response import error, success
from portal.models.branch import Branch
from portal.models.case_prescription import CasePrescription
from portal.models.custom_medicine_request import (
    STATUSES as REQUEST_STATUSES,
    CustomMedicineRequest,
)
from portal.models.department import Department
from portal.models.generated_prescription import GeneratedPrescription
from portal.models.medicine import Medicine
from portal.models.medicine_brand import (
    DEFAULT_REORDER_LEVEL,
    FORMS,
    MedicineBrand,
    StockBatch,
    medicine_departments,
)
from portal.models.pharmacist import Pharmacist

pharmacy_bp = Blueprint("pharmacy", __name__)

BRAND_CREATED = "pharmacy.brand_created"
BRAND_UPDATED = "pharmacy.brand_updated"
BRAND_DELETED = "pharmacy.brand_deleted"
BRAND_ARCHIVED = "pharmacy.brand_archived"
STOCK_ADDED = "pharmacy.stock_added"

SEARCH_LIMIT = 50
# A batch inside this window is worth flagging before it becomes dead stock.
EXPIRING_SOON_DAYS = 60

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


def _paginate(query, order_by):
    """Applies ?page= / ?page_size= and returns (rows, meta).

    The catalogue is the one list here that grows without bound — a hospital
    formulary runs to thousands of products — so it is paged rather than
    returned whole. Meta is returned alongside so the client can render
    "showing 26-50 of 312" without a second count request.
    """
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    total = query.order_by(None).count()
    rows = query.order_by(order_by).offset((page - 1) * page_size).limit(page_size).all()
    return rows, {
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


def current_pharmacist():
    return Pharmacist.query.filter_by(user_id=get_jwt_identity()).first()


def _is_admin():
    return get_jwt().get("role") == "admin"


def _resolve_branch():
    """The branch this request works against.

    A pharmacist is pinned to their own. An admin has no counter of their own,
    so they must name one with ?branch_id= -- guessing would silently show
    them somebody else's shelf.
    """
    pharmacist = current_pharmacist()
    if pharmacist:
        return pharmacist.branch, None

    if _is_admin():
        branch_id = request.args.get("branch_id", type=int)
        if not branch_id:
            return None, error(
                "Pass ?branch_id= — an admin account is not tied to a branch", status=422
            )
        branch = db.session.get(Branch, branch_id)
        if not branch:
            return None, error("Branch not found", status=404)
        return branch, None

    return None, error("No pharmacy branch for this account", status=403)


# --------------------------------------------------------------------------
# branches
# --------------------------------------------------------------------------


@pharmacy_bp.get("/branches")
@role_required("pharmacist", "admin")
def list_branches():
    branches = Branch.query.filter_by(is_active=True).order_by(Branch.name).all()
    return success([b.to_dict() for b in branches])


# --------------------------------------------------------------------------
# catalogue: brands
# --------------------------------------------------------------------------


def _clean(payload, field, limit=150):
    value = payload.get(field)
    if value is None:
        return None
    return str(value).strip()[:limit] or None


def _read_departments(payload):
    """Resolves the department ids on a request body.

    Returns `(departments, error_response)`. Unknown ids are rejected rather
    than skipped: silently dropping one would file a medicine under fewer
    departments than the pharmacist chose, and they would only find out when
    a doctor could not prescribe it.
    """
    raw = payload.get("department_ids")
    if raw is None:
        return None, None
    if not isinstance(raw, list):
        return None, error("department_ids must be a list", status=422)

    ids = []
    for value in raw:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            return None, error("department_ids must be whole numbers", status=422)

    if not ids:
        return [], None

    departments = Department.query.filter(Department.id.in_(ids)).all()
    missing = set(ids) - {d.id for d in departments}
    if missing:
        return None, error(
            f"Unknown department id(s): {', '.join(str(i) for i in sorted(missing))}",
            status=422,
        )
    return departments, None


def _read_reorder_level(payload, default=DEFAULT_REORDER_LEVEL):
    raw = payload.get("reorder_level")
    if raw in (None, ""):
        return default, None
    try:
        level = int(raw)
    except (TypeError, ValueError):
        return None, error("reorder_level must be a whole number", status=422)
    if level < 0:
        return None, error("reorder_level cannot be negative", status=422)
    return level, None


def _read_unit_price(payload):
    raw = payload.get("unit_price")
    if raw in (None, ""):
        return None, None
    try:
        price = float(raw)
    except (TypeError, ValueError):
        return None, error("unit_price must be a number", status=422)
    if price < 0:
        return None, error("unit_price cannot be negative", status=422)
    return price, None


@pharmacy_bp.post("/brands")
@role_required("pharmacist", "admin")
def create_brand():
    """Adds a medicine to the catalogue, filed under its departments.

    The catalogue is hospital-wide, not per branch: the same product exists
    whether or not this counter happens to stock it, and duplicating it per
    branch is what makes cross-branch search impossible later. Departments are
    a property of the medicine for the same reason — Oxytocin belongs to
    Gynecology everywhere, not just at one counter.
    """
    payload = request.get_json(silent=True) or {}

    brand_name = _clean(payload, "brand_name")
    if not brand_name:
        return error("Medicine name is required", status=422)

    strength = _clean(payload, "strength", 80)
    clash = MedicineBrand.query.filter_by(brand_name=brand_name, strength=strength).first()
    if clash:
        return error(
            f"{clash.display_name} is already in the catalogue — edit it or add stock to it instead.",
            status=409,
        )

    form = payload.get("form") or "tablet"
    if form not in FORMS:
        return error(f"form must be one of: {', '.join(FORMS)}", status=422)

    reorder_level, failure = _read_reorder_level(payload)
    if failure:
        return failure
    unit_price, failure = _read_unit_price(payload)
    if failure:
        return failure
    departments, failure = _read_departments(payload)
    if failure:
        return failure

    for_all = bool(payload.get("for_all_departments"))
    if not for_all and not departments:
        # Otherwise the medicine lands in the catalogue but appears on no
        # department's page and no doctor can prescribe it — added, and
        # invisible.
        return error(
            "Choose at least one department, or mark it as stocked for all departments",
            status=422,
        )

    # Optional link to the clinical formulary, so a prescription written
    # against the generic can be filled with this brand.
    medicine_id = payload.get("medicine_id") or None
    if medicine_id and not db.session.get(Medicine, medicine_id):
        return error("Formulary medicine not found", status=404)

    brand = MedicineBrand(
        brand_name=brand_name,
        generic_name=_clean(payload, "generic_name"),
        used_for=_clean(payload, "used_for", 2000),
        usage_instructions=_clean(payload, "usage_instructions", 2000),
        category=_clean(payload, "category", 100),
        manufacturer=_clean(payload, "manufacturer"),
        form=form,
        strength=strength,
        unit_price=unit_price,
        reorder_level=reorder_level,
        for_all_departments=for_all,
        medicine_id=medicine_id,
    )
    brand.departments = departments or []
    db.session.add(brand)
    db.session.flush()

    audit(
        BRAND_CREATED,
        entity="medicine_brand",
        entity_id=brand.id,
        detail=f"Added {brand.display_name} ({_department_label(brand)})",
    )
    db.session.commit()
    dashboard_changed("pharmacy_brand_created")

    branch, _ = _resolve_branch()
    return success(
        brand.to_dict(branch_id=branch.id if branch else None),
        message=f"{brand.display_name} added",
        status=201,
    )


def _department_label(brand):
    if brand.for_all_departments:
        return "all departments"
    names = [d.name for d in brand.departments]
    return ", ".join(names) if names else "no department"


@pharmacy_bp.get("/brands")
@role_required("pharmacist", "admin")
def list_brands():
    """The catalogue, filtered and paged, with this branch's quantity per row.

    `?department_id=` is what makes the inventory department-wise: it returns
    the medicines that department stocks, including the ones marked for all
    departments, because shared stock is genuinely part of every department's
    shelf rather than a separate list to check.
    """
    branch, failure = _resolve_branch()
    if failure:
        return failure

    query = MedicineBrand.query

    status = request.args.get("status", "active")
    if status == "active":
        query = query.filter(MedicineBrand.is_active.is_(True))
    elif status == "discontinued":
        query = query.filter(MedicineBrand.is_active.is_(False))
    elif status != "all":
        return error("status must be one of: active, discontinued, all", status=422)

    department_id = request.args.get("department_id", type=int)
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

    category = (request.args.get("category") or "").strip()
    if category:
        query = query.filter(MedicineBrand.category == category)

    manufacturer = (request.args.get("manufacturer") or "").strip()
    if manufacturer:
        query = query.filter(MedicineBrand.manufacturer.ilike(f"%{manufacturer}%"))

    form = (request.args.get("form") or "").strip()
    if form:
        if form not in FORMS:
            return error(f"form must be one of: {', '.join(FORMS)}", status=422)
        query = query.filter(MedicineBrand.form == form)

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                MedicineBrand.brand_name.ilike(like),
                MedicineBrand.generic_name.ilike(like),
                MedicineBrand.manufacturer.ilike(like),
                MedicineBrand.category.ilike(like),
                MedicineBrand.used_for.ilike(like),
            )
        )

    brands, meta = _paginate(query, MedicineBrand.brand_name)
    rows = [b.to_dict(branch_id=branch.id) for b in brands]

    # Stock state is computed per row, so it is filtered after paging rather
    # than in SQL. Applied to the page only, and reported honestly in meta so
    # a short page is not mistaken for the end of the list.
    availability = request.args.get("availability")
    if availability:
        if availability not in ("available", "low_stock", "out_of_stock", "discontinued"):
            return error(
                "availability must be one of: available, low_stock, out_of_stock, discontinued",
                status=422,
            )
        rows = [r for r in rows if r["availability"] == availability]
        meta["filtered_on_page"] = True

    return success({"branch": branch.to_dict(), "items": rows, "meta": meta})


@pharmacy_bp.get("/brands/<int:brand_id>")
@role_required("pharmacist", "admin")
def get_brand(brand_id):
    """One medicine in full, including this branch's batches."""
    brand = db.session.get(MedicineBrand, brand_id)
    if not brand:
        return error("Medicine not found", status=404)

    branch, failure = _resolve_branch()
    if failure:
        return failure
    return success(brand.to_dict(branch_id=branch.id, include_batches=True))


@pharmacy_bp.patch("/brands/<int:brand_id>")
@role_required("pharmacist", "admin")
def update_brand(brand_id):
    """Edits a medicine. Only the fields present in the body are touched."""
    brand = db.session.get(MedicineBrand, brand_id)
    if not brand:
        return error("Medicine not found", status=404)

    payload = request.get_json(silent=True) or {}

    if "brand_name" in payload:
        brand_name = _clean(payload, "brand_name")
        if not brand_name:
            return error("Medicine name is required", status=422)
        strength = (
            _clean(payload, "strength", 80) if "strength" in payload else brand.strength
        )
        clash = (
            MedicineBrand.query.filter(
                MedicineBrand.brand_name == brand_name,
                MedicineBrand.strength.is_(None) if strength is None else MedicineBrand.strength == strength,
                MedicineBrand.id != brand.id,
            ).first()
        )
        if clash:
            return error(
                f"{clash.display_name} is already in the catalogue", status=409
            )
        brand.brand_name = brand_name

    if "strength" in payload:
        brand.strength = _clean(payload, "strength", 80)

    for field, limit in (
        ("generic_name", 150),
        ("used_for", 2000),
        ("usage_instructions", 2000),
        ("category", 100),
        ("manufacturer", 150),
    ):
        if field in payload:
            setattr(brand, field, _clean(payload, field, limit))

    if "form" in payload:
        if payload.get("form") not in FORMS:
            return error(f"form must be one of: {', '.join(FORMS)}", status=422)
        brand.form = payload["form"]

    if "reorder_level" in payload:
        level, failure = _read_reorder_level(payload, default=brand.reorder_level)
        if failure:
            return failure
        brand.reorder_level = level

    if "unit_price" in payload:
        price, failure = _read_unit_price(payload)
        if failure:
            return failure
        brand.unit_price = price

    if "for_all_departments" in payload:
        brand.for_all_departments = bool(payload["for_all_departments"])

    if "department_ids" in payload:
        departments, failure = _read_departments(payload)
        if failure:
            return failure
        brand.departments = departments or []

    if not brand.for_all_departments and not brand.departments:
        return error(
            "A medicine must belong to at least one department, or be marked as "
            "stocked for all departments",
            status=422,
        )

    if "is_active" in payload:
        brand.is_active = bool(payload["is_active"])

    audit(
        BRAND_UPDATED,
        entity="medicine_brand",
        entity_id=brand.id,
        detail=f"Updated {brand.display_name} ({_department_label(brand)})",
    )
    db.session.commit()
    dashboard_changed("pharmacy_brand_updated")

    branch, _ = _resolve_branch()
    return success(
        brand.to_dict(branch_id=branch.id if branch else None), message="Medicine updated"
    )


@pharmacy_bp.delete("/brands/<int:brand_id>")
@role_required("pharmacist", "admin")
def delete_brand(brand_id):
    """Removes a medicine from the catalogue.

    Deleted outright only when nothing depends on it. A medicine that has been
    prescribed is part of a patient's record, and one holding stock is
    physically on a shelf — either is discontinued instead, which takes it out
    of every department view and out of what doctors can prescribe while
    leaving the history intact.

    The response says which happened, so the pharmacist is never told
    something was deleted when it was archived.
    """
    brand = db.session.get(MedicineBrand, brand_id)
    if not brand:
        return error("Medicine not found", status=404)

    label = brand.display_name
    prescribed = (
        db.session.query(GeneratedPrescription.id).filter_by(brand_id=brand.id).first()
        or db.session.query(CasePrescription.id).filter_by(brand_id=brand.id).first()
    )
    remaining_units = sum(b.quantity for b in brand.batches)

    if prescribed or remaining_units > 0:
        if not brand.is_active:
            return error(f"{label} is already discontinued", status=409)
        brand.is_active = False
        reason = (
            "it has been prescribed to patients"
            if prescribed
            else f"{remaining_units} unit(s) are still in stock"
        )
        audit(
            BRAND_ARCHIVED,
            entity="medicine_brand",
            entity_id=brand.id,
            detail=f"Discontinued {label} instead of deleting — {reason}",
        )
        db.session.commit()
        dashboard_changed("pharmacy_brand_updated")
        return success(
            {"deleted": False, "brand": brand.to_dict()},
            message=(
                f"{label} could not be deleted because {reason}. It has been marked "
                "discontinued instead, so it no longer appears in any department or "
                "prescription."
            ),
        )

    audit(
        BRAND_DELETED,
        entity="medicine_brand",
        entity_id=brand.id,
        detail=f"Deleted {label} from the catalogue ({_department_label(brand)})",
    )
    # Empty batch rows (a zeroed shelf) go with it; the cascade on the
    # relationship handles those.
    db.session.delete(brand)
    db.session.commit()
    dashboard_changed("pharmacy_brand_deleted")

    return success({"deleted": True}, message=f"{label} deleted")


# --------------------------------------------------------------------------
# custom medicines doctors had to write by hand
# --------------------------------------------------------------------------


@pharmacy_bp.get("/medicine-requests")
@role_required("pharmacist", "admin")
def list_medicine_requests():
    """Medicines doctors prescribed that the catalogue does not have.

    The pharmacy's side of manual entry: a doctor is never blocked by the
    catalogue, and in exchange every medicine they type by hand lands here for
    a decision. Pending first, then the most-prescribed — a gap five doctors
    have hit matters more than one seen once.
    """
    status = request.args.get("status", "pending")
    if status not in (*REQUEST_STATUSES, "all"):
        allowed = ", ".join((*REQUEST_STATUSES, "all"))
        return error(f"status must be one of: {allowed}", status=422)

    query = CustomMedicineRequest.query
    if status != "all":
        query = query.filter(CustomMedicineRequest.status == status)

    requests = query.order_by(
        db.case((CustomMedicineRequest.status == "pending", 0), else_=1),
        CustomMedicineRequest.times_prescribed.desc(),
        CustomMedicineRequest.last_requested_at.desc(),
    ).all()

    return success(
        {
            "items": [r.to_dict() for r in requests],
            "pending": CustomMedicineRequest.query.filter_by(status="pending").count(),
        }
    )


@pharmacy_bp.post("/medicine-requests/<int:request_id>/add")
@role_required("pharmacist", "admin")
def add_requested_medicine(request_id):
    """Completes a doctor-added medicine and marks it reviewed.

    The medicine already exists — it was added to the catalogue when the
    doctor signed the prescription, so it is prescribable and searchable
    already. What is missing is everything a prescription cannot carry:
    category, manufacturer, price, the real dosage form. This fills those in
    and records that a pharmacist has looked at it.

    Anything omitted keeps whatever the medicine already has, so a pharmacist
    correcting one field does not blank the rest.
    """
    medicine_request = db.session.get(CustomMedicineRequest, request_id)
    if not medicine_request:
        return error("Request not found", status=404)
    if medicine_request.status == "added":
        return error(
            f"{medicine_request.medicine_name} has already been reviewed", status=409
        )

    brand = medicine_request.created_brand
    if brand is None:
        # A dismissed request being revived, or one raised before medicines
        # were added automatically. Either way there is nothing to complete,
        # so it is created here.
        brand = MedicineBrand(
            brand_name=medicine_request.medicine_name,
            usage_instructions=medicine_request.instructions,
            added_by_doctor=True,
        )
        brand.departments = (
            [medicine_request.department] if medicine_request.department else []
        )
        brand.for_all_departments = medicine_request.department is None
        db.session.add(brand)
        db.session.flush()
        medicine_request.created_brand_id = brand.id

    payload = request.get_json(silent=True) or {}

    if "brand_name" in payload:
        brand_name = _clean(payload, "brand_name")
        if not brand_name:
            return error("Medicine name is required", status=422)
        brand.brand_name = brand_name
    if "strength" in payload:
        brand.strength = _clean(payload, "strength", 80)

    clash = MedicineBrand.query.filter(
        MedicineBrand.brand_name == brand.brand_name,
        MedicineBrand.strength.is_(None)
        if brand.strength is None
        else MedicineBrand.strength == brand.strength,
        MedicineBrand.id != brand.id,
    ).first()
    if clash:
        return error(
            f"{clash.display_name} is already in the catalogue under that name and "
            "strength. Give this one a different name, or dismiss it as a duplicate.",
            status=409,
        )

    for field, limit in (
        ("generic_name", 150),
        ("used_for", 2000),
        ("usage_instructions", 2000),
        ("category", 100),
        ("manufacturer", 150),
    ):
        if field in payload:
            setattr(brand, field, _clean(payload, field, limit))

    if "form" in payload:
        if payload.get("form") not in FORMS:
            return error(f"form must be one of: {', '.join(FORMS)}", status=422)
        brand.form = payload["form"]

    if "reorder_level" in payload:
        level, failure = _read_reorder_level(payload, default=brand.reorder_level)
        if failure:
            return failure
        brand.reorder_level = level

    if "unit_price" in payload:
        unit_price, failure = _read_unit_price(payload)
        if failure:
            return failure
        brand.unit_price = unit_price

    if "for_all_departments" in payload:
        brand.for_all_departments = bool(payload["for_all_departments"])
    if "department_ids" in payload:
        departments, failure = _read_departments(payload)
        if failure:
            return failure
        brand.departments = departments or []

    if not brand.for_all_departments and not brand.departments:
        return error(
            "Choose at least one department, or mark it as stocked for all departments",
            status=422,
        )

    # Reviewed by a pharmacist, so it is an ordinary catalogue medicine now
    # and subject to the usual stock rules.
    brand.added_by_doctor = False
    brand.is_active = True

    medicine_request.status = "added"
    medicine_request.reviewed_by = int(get_jwt_identity())
    medicine_request.reviewed_at = datetime.utcnow()
    medicine_request.review_note = _clean(payload, "review_note", 255)

    audit(
        BRAND_UPDATED,
        entity="medicine_brand",
        entity_id=brand.id,
        detail=f"Completed {brand.display_name} ({_department_label(brand)}) after a doctor added it",
    )
    audit(
        CUSTOM_MEDICINE_ADDED,
        entity="custom_medicine_request",
        entity_id=medicine_request.id,
        detail=(
            f"{brand.display_name} reviewed by the pharmacy after being prescribed by "
            f"hand {medicine_request.times_prescribed} time(s)"
        ),
    )

    if medicine_request.doctor and medicine_request.doctor.user_id:
        notify(
            [medicine_request.doctor.user_id],
            title="Medicine confirmed by the pharmacy",
            body=(
                f"{brand.display_name}, which you added while prescribing, has been "
                "completed by the pharmacy and is a standard catalogue medicine now."
            ),
            category="pharmacy",
            link="/dashboard/prescriptions",
            exclude_user_id=get_jwt_identity(),
        )

    db.session.commit()
    dashboard_changed("pharmacy_brand_updated")

    branch, _ = _resolve_branch()
    return success(
        {
            "request": medicine_request.to_dict(),
            "brand": brand.to_dict(branch_id=branch.id if branch else None),
        },
        message=f"{brand.display_name} completed",
        status=200,
    )


@pharmacy_bp.post("/medicine-requests/<int:request_id>/dismiss")
@role_required("pharmacist", "admin")
def dismiss_medicine_request(request_id):
    """Rejects a doctor-added medicine and withdraws it from the catalogue.

    For a duplicate of something already listed, a typo, or a name the
    hospital will not carry. Because the medicine went into the catalogue when
    the doctor signed for it, dismissing has to take it back out — otherwise
    the rejection would be a note nobody acts on while doctors keep finding
    it in search.

    Withdrawn rather than deleted when it has already been prescribed: those
    prescriptions name a real medicine and must keep resolving. The request
    row stays either way, and its count keeps rising if doctors keep needing
    it — a dismissal that turns out to be wrong shows itself rather than
    hiding.
    """
    medicine_request = db.session.get(CustomMedicineRequest, request_id)
    if not medicine_request:
        return error("Request not found", status=404)
    if medicine_request.status == "added":
        return error(
            "This medicine has already been reviewed and accepted. Edit or delete it "
            "from the medicines list instead.",
            status=409,
        )

    payload = request.get_json(silent=True) or {}
    brand = medicine_request.created_brand
    withdrawn = False

    if brand is not None:
        prescribed = (
            db.session.query(GeneratedPrescription.id).filter_by(brand_id=brand.id).first()
            or db.session.query(CasePrescription.id).filter_by(brand_id=brand.id).first()
        )
        if prescribed:
            brand.is_active = False
            withdrawn = True
        else:
            brand.departments = []
            db.session.delete(brand)
            medicine_request.created_brand_id = None

    medicine_request.status = "dismissed"
    medicine_request.reviewed_by = int(get_jwt_identity())
    medicine_request.reviewed_at = datetime.utcnow()
    medicine_request.review_note = _clean(payload, "review_note", 255)

    audit(
        CUSTOM_MEDICINE_DISMISSED,
        entity="custom_medicine_request",
        entity_id=medicine_request.id,
        detail=(
            f"{medicine_request.medicine_name} rejected and "
            f"{'discontinued' if withdrawn else 'removed'} from the catalogue"
            f"{f': {medicine_request.review_note}' if medicine_request.review_note else ''}"
        ),
    )
    db.session.commit()
    dashboard_changed("pharmacy_brand_deleted")

    return success(
        {**medicine_request.to_dict(), "withdrawn": withdrawn},
        message=(
            f"{medicine_request.medicine_name} discontinued — it has been prescribed, so "
            "the record is kept but doctors can no longer select it."
            if withdrawn
            else f"{medicine_request.medicine_name} removed from the catalogue."
        ),
    )


@pharmacy_bp.get("/departments")
@role_required("pharmacist", "admin")
def list_department_inventory():
    """Every department with how much of its shelf is in what state.

    The entry point to the department-wise inventory: the pharmacist picks a
    department here and drills into its medicines. Counts include the
    all-departments stock, because that is genuinely part of each department's
    shelf rather than a separate pool.
    """
    branch, failure = _resolve_branch()
    if failure:
        return failure

    shared = MedicineBrand.query.filter(
        MedicineBrand.is_active.is_(True), MedicineBrand.for_all_departments.is_(True)
    ).all()

    rows = []
    for department in Department.query.order_by(Department.name).all():
        tagged = (
            MedicineBrand.query.join(
                medicine_departments,
                medicine_departments.c.brand_id == MedicineBrand.id,
            )
            .filter(
                medicine_departments.c.department_id == department.id,
                MedicineBrand.is_active.is_(True),
                MedicineBrand.for_all_departments.is_(False),
            )
            .all()
        )
        brands = tagged + shared
        rows.append(
            {
                "id": department.id,
                "name": department.name,
                "medicine_count": len(brands),
                "own_medicine_count": len(tagged),
                "shared_medicine_count": len(shared),
                "out_of_stock": sum(1 for b in brands if b.total_quantity == 0),
                "low_stock": sum(
                    1 for b in brands if 0 < b.total_quantity < b.reorder_level
                ),
                "units_in_branch": sum(b.quantity_in(branch.id) for b in brands),
            }
        )

    return success({"branch": branch.to_dict(), "departments": rows})


@pharmacy_bp.get("/categories")
@role_required("pharmacist", "admin")
def list_categories():
    """Distinct categories with how many brands and how much stock sit under
    each — a category with no stock is worth seeing as much as a full one."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    rows = (
        db.session.query(MedicineBrand.category, db.func.count(MedicineBrand.id))
        .filter(MedicineBrand.is_active.is_(True))
        .group_by(MedicineBrand.category)
        .order_by(MedicineBrand.category)
        .all()
    )

    out = []
    for category, brand_count in rows:
        brands = MedicineBrand.query.filter(
            MedicineBrand.category.is_(None) if category is None else MedicineBrand.category == category,
            MedicineBrand.is_active.is_(True),
        ).all()
        out.append(
            {
                "category": category or "Uncategorised",
                "brand_count": brand_count,
                "units_in_stock": sum(b.quantity_in(branch.id) for b in brands),
                "out_of_stock": sum(1 for b in brands if b.quantity_in(branch.id) == 0),
            }
        )
    return success(out)


# --------------------------------------------------------------------------
# search — the reason this module exists
# --------------------------------------------------------------------------


@pharmacy_bp.get("/search")
@role_required("pharmacist", "admin")
def search_medicines():
    """Find a medicine here, and if it isn't here, find who has it.

    Returns two lists deliberately rather than one merged list:

      * `in_branch`   — what this counter can dispense right now
      * `other_branches` — where to source anything it cannot

    A brand stocked here but at zero appears in `in_branch` with quantity 0 AND
    in `other_branches` if somebody else has it, because "we carry it but we're
    out, and Kakinada has 40" is the answer the pharmacist actually needs.
    """
    branch, failure = _resolve_branch()
    if failure:
        return failure

    term = (request.args.get("q") or "").strip()
    if len(term) < 2:
        return error("Type at least two characters to search", status=422)

    like = f"%{term}%"
    matches = (
        MedicineBrand.query.filter(
            MedicineBrand.is_active.is_(True),
            db.or_(
                MedicineBrand.brand_name.ilike(like),
                MedicineBrand.generic_name.ilike(like),
                # Searching by indication is why `used_for` is free text:
                # "fever" should find paracetamol without knowing the brand.
                MedicineBrand.used_for.ilike(like),
                MedicineBrand.category.ilike(like),
            ),
        )
        .order_by(MedicineBrand.brand_name)
        .limit(SEARCH_LIMIT)
        .all()
    )

    today = date.today()
    in_branch, elsewhere = [], []

    for brand in matches:
        row = brand.to_dict(branch_id=branch.id)
        row["batches"] = [
            b.to_dict()
            for b in sorted(
                (
                    x
                    for x in brand.batches
                    if x.branch_id == branch.id and x.quantity > 0
                ),
                # Nearest expiry first: that is the batch to dispense next.
                key=lambda x: (x.expiry_date or date.max),
            )
        ]
        in_branch.append(row)

        # Only look outward when this counter cannot serve the request.
        if row["quantity"] > 0:
            continue

        for other in brand.batches:
            if other.branch_id == branch.id or other.quantity <= 0:
                continue
            if other.expiry_date and other.expiry_date < today:
                continue
            elsewhere.append(
                {
                    "brand_id": brand.id,
                    "brand_name": brand.display_name,
                    "generic_name": brand.generic_name,
                    "used_for": brand.used_for,
                    "form_label": brand.form_label,
                    "branch": other.branch.to_dict() if other.branch else None,
                    "quantity": other.quantity,
                    "batch_no": other.batch_no,
                    "expiry_date": other.expiry_date.isoformat() if other.expiry_date else None,
                }
            )

    # Collapse to one row per (brand, branch): a branch holding three batches
    # is one place to call, not three.
    merged = {}
    for row in elsewhere:
        key = (row["brand_id"], row["branch"]["id"] if row["branch"] else None)
        if key in merged:
            merged[key]["quantity"] += row["quantity"]
        else:
            merged[key] = row
    other_branches = sorted(merged.values(), key=lambda r: -r["quantity"])

    return success(
        {
            "query": term,
            "branch": branch.to_dict(),
            "in_branch": in_branch,
            "available_here": sum(1 for r in in_branch if r["quantity"] > 0),
            "other_branches": other_branches,
        }
    )


# --------------------------------------------------------------------------
# stock
# --------------------------------------------------------------------------


@pharmacy_bp.get("/inventory")
@role_required("pharmacist", "admin")
def inventory():
    """Every batch on this branch's shelf."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    query = StockBatch.query.filter(StockBatch.branch_id == branch.id)
    if request.args.get("in_stock") == "true":
        query = query.filter(StockBatch.quantity > 0)

    batches = query.join(MedicineBrand).order_by(MedicineBrand.brand_name).all()
    return success({"branch": branch.to_dict(), "batches": [b.to_dict() for b in batches]})


@pharmacy_bp.post("/stock")
@role_required("pharmacist", "admin")
def add_stock():
    """Receives stock into this branch.

    Always writes to the caller's own branch -- a pharmacist cannot post stock
    into somebody else's counter, which is why `branch_id` is not read from the
    body here.
    """
    branch, failure = _resolve_branch()
    if failure:
        return failure

    payload = request.get_json(silent=True) or {}

    brand = db.session.get(MedicineBrand, payload.get("brand_id"))
    if not brand:
        return error("Medicine not found — add it to the catalogue first", status=404)

    try:
        quantity = int(payload.get("quantity"))
    except (TypeError, ValueError):
        return error("quantity must be a whole number", status=422)
    if quantity <= 0:
        return error("quantity must be greater than zero", status=422)

    expiry_date = None
    raw_expiry = payload.get("expiry_date")
    if raw_expiry:
        try:
            expiry_date = datetime.strptime(raw_expiry, "%Y-%m-%d").date()
        except ValueError:
            return error("expiry_date must be YYYY-MM-DD", status=422)
        if expiry_date < date.today():
            return error("That batch is already expired — it cannot be received", status=422)

    def _money(field):
        raw = payload.get(field)
        if raw in (None, ""):
            return None, None
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return None, f"{field} must be a number"
        if value < 0:
            return None, f"{field} cannot be negative"
        return value, None

    mrp, err = _money("mrp")
    if err:
        return error(err, status=422)
    cost_price, err = _money("cost_price")
    if err:
        return error(err, status=422)

    batch_no = _clean(payload, "batch_no", 60)

    # Same brand, same batch, same expiry in the same branch is a top-up of an
    # existing row, not a second row -- otherwise the shelf fragments into
    # duplicates that have to be summed everywhere.
    existing = StockBatch.query.filter_by(
        branch_id=branch.id, brand_id=brand.id, batch_no=batch_no, expiry_date=expiry_date
    ).first()

    if existing:
        existing.quantity += quantity
        if mrp is not None:
            existing.mrp = mrp
        if cost_price is not None:
            existing.cost_price = cost_price
        batch = existing
    else:
        batch = StockBatch(
            branch_id=branch.id,
            brand_id=brand.id,
            batch_no=batch_no,
            expiry_date=expiry_date,
            quantity=quantity,
            mrp=mrp,
            cost_price=cost_price,
        )
        db.session.add(batch)

    audit(
        STOCK_ADDED,
        entity="medicine_brand",
        entity_id=brand.id,
        detail=f"+{quantity} {brand.display_name} into {branch.name}",
    )
    db.session.commit()
    dashboard_changed("pharmacy_stock_changed")

    return success(
        {"batch": batch.to_dict(), "brand": brand.to_dict(branch_id=branch.id)},
        message=f"{quantity} units of {brand.display_name} received",
        status=201,
    )


@pharmacy_bp.get("/low-stock")
@role_required("pharmacist", "admin")
def low_stock():
    """Brands at or under their reorder level in this branch, out-of-stock
    first — those are the ones costing a sale right now."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    rows = []
    for brand in MedicineBrand.query.filter(MedicineBrand.is_active.is_(True)).all():
        quantity = brand.quantity_in(branch.id)
        if quantity < brand.reorder_level:
            rows.append({**brand.to_dict(branch_id=branch.id), "shortfall": brand.reorder_level - quantity})

    rows.sort(key=lambda r: (r["quantity"], r["brand_name"]))
    return success({"branch": branch.to_dict(), "items": rows})


@pharmacy_bp.get("/expired")
@role_required("pharmacist", "admin")
def expired_stock():
    """Batches already expired, plus those close enough to matter."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    today = date.today()
    horizon = today + timedelta(days=EXPIRING_SOON_DAYS)

    batches = (
        StockBatch.query.filter(
            StockBatch.branch_id == branch.id,
            StockBatch.quantity > 0,
            StockBatch.expiry_date.isnot(None),
            StockBatch.expiry_date <= horizon,
        )
        .order_by(StockBatch.expiry_date)
        .all()
    )

    return success(
        {
            "branch": branch.to_dict(),
            "expired": [b.to_dict() for b in batches if b.expiry_date < today],
            "expiring_soon": [b.to_dict() for b in batches if b.expiry_date >= today],
            "horizon_days": EXPIRING_SOON_DAYS,
        }
    )


@pharmacy_bp.get("/summary")
@role_required("pharmacist", "admin")
def summary():
    """The counter's dashboard figures."""
    branch, failure = _resolve_branch()
    if failure:
        return failure

    today = date.today()
    brands = MedicineBrand.query.filter(MedicineBrand.is_active.is_(True)).all()

    quantities = {b.id: b.quantity_in(branch.id) for b in brands}
    stocked = [b for b in brands if quantities[b.id] > 0]

    expired_units = (
        db.session.query(db.func.coalesce(db.func.sum(StockBatch.quantity), 0))
        .filter(
            StockBatch.branch_id == branch.id,
            StockBatch.quantity > 0,
            StockBatch.expiry_date.isnot(None),
            StockBatch.expiry_date < today,
        )
        .scalar()
    )

    expiring_soon = (
        db.session.query(db.func.count(StockBatch.id))
        .filter(
            StockBatch.branch_id == branch.id,
            StockBatch.quantity > 0,
            StockBatch.expiry_date.isnot(None),
            StockBatch.expiry_date >= today,
            StockBatch.expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS),
        )
        .scalar()
    )

    # Retail value of what is on the shelf, at MRP, excluding expired stock.
    stock_value = sum(
        (float(b.mrp) if b.mrp is not None else 0) * b.quantity
        for b in StockBatch.query.filter(
            StockBatch.branch_id == branch.id, StockBatch.quantity > 0
        ).all()
        if not b.is_expired
    )

    return success(
        {
            "branch": branch.to_dict(),
            "catalogue_size": len(brands),
            "in_stock": len(stocked),
            "out_of_stock": len(brands) - len(stocked),
            "low_stock": sum(
                1 for b in brands if 0 < quantities[b.id] < b.reorder_level
            ),
            "total_units": sum(quantities.values()),
            "stock_value": round(stock_value, 2),
            "expired_units": int(expired_units or 0),
            "expiring_soon_batches": int(expiring_soon or 0),
        }
    )
