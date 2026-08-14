"""Prescribing: what the doctor can reach for, and everything ever written.

Two things live here.

**Medicine search** backs the picker in the prescription editor, reading the
practice's own catalogue (see `helpers/formulary`). A doctor picking from it
rather than typing by hand is what keeps prescription lines resolvable — to a
generic, to a stored precedent, and to the same medicine next time.

**Prescription history** is every prescription the practice has written, with
the symptoms and diagnosis that produced it. Read-only here: a prescription is
created by ending a consultation and changed only by the doctor in the
consultation room.

Both are readable by the PA as well as the doctor. Pulling up what somebody
was prescribed last visit is desk work — a patient rings and asks — and it is
reading, not writing. Nothing in this module writes anything.
"""

from datetime import datetime, time, timedelta

from flask import Blueprint, request

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.decorators import clinical_read
from portal.helpers.formulary import prescribable
from portal.helpers.patient_search import patient_search_filter
from portal.helpers.response import error, success
from portal.models.consultation import Consultation
from portal.models.consultation_summary import ConsultationSummary
from portal.models.doctor import Doctor
from portal.models.generated_prescription import GeneratedPrescription
from portal.models.user import User

prescription_bp = Blueprint("prescriptions", __name__)

SEARCH_LIMIT = 20
MIN_SEARCH_LENGTH = 1
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


@prescription_bp.get("/medicines")
@clinical_read
def search_medicines():
    """Autocomplete for the prescription editor.

    Ranked so typing a few letters puts the obvious answer first: names that
    start with the term, then names that contain it, then matches on the
    generic name or indication. A plain alphabetical list would bury "Dolo
    650" under everything else containing "do".

    With no query it returns the first page of the catalogue, so opening the
    picker shows something to choose from rather than a blank box.
    """
    brands = prescribable()

    term = (request.args.get("q") or "").strip().lower()
    if not term:
        return success(
            {
                "query": "",
                "items": [_medicine_option(b) for b in brands[:SEARCH_LIMIT]],
                "total_available": len(brands),
            }
        )

    if len(term) < MIN_SEARCH_LENGTH:
        return error("Type at least one character to search", status=422)

    def rank(brand):
        name = (brand.brand_name or "").lower()
        generic = (brand.generic_name or "").lower()
        if name.startswith(term):
            return 0
        if term in name:
            return 1
        if generic.startswith(term):
            return 2
        if term in generic:
            return 3
        return 4

    def matches(brand):
        """Substring on the names, word-prefix on the descriptive fields.

        A name is matched loosely because that is how autocomplete is used —
        a few letters from anywhere in "Atorva". Category and indication are
        matched on word starts instead: a plain substring there makes "ator"
        return an antibiotic, because its indication says "respiratory", and
        a picker that answers a drug name with an unrelated drug is worse
        than one that answers nothing.

        A multi-word term is treated as a phrase, so "blood pressure" still
        finds what it should.
        """
        name = (brand.brand_name or "").lower()
        generic = (brand.generic_name or "").lower()
        if term in name or term in generic:
            return True

        described = f"{brand.category or ''} {brand.used_for or ''}".lower()
        if " " in term:
            return term in described
        return any(word.startswith(term) for word in described.replace(",", " ").split())

    found = [b for b in brands if matches(b)]
    found.sort(key=lambda b: (rank(b), b.brand_name or ""))

    return success(
        {
            "query": term,
            "items": [_medicine_option(b) for b in found[:SEARCH_LIMIT]],
            "total_available": len(brands),
        }
    )


def _medicine_option(brand):
    """One row in the picker.

    Carries the defaults the editor pre-fills a new line with, so adding a
    medicine gives the doctor something sensible to adjust rather than four
    empty boxes.
    """
    return {
        "brand_id": brand.id,
        "name": brand.display_name,
        "brand_name": brand.brand_name,
        "generic_name": brand.generic_name,
        "strength": brand.strength,
        "form": brand.form,
        "form_label": brand.form_label,
        "category": brand.category,
        "used_for": brand.used_for,
        "usage_instructions": brand.usage_instructions,
        "unit_price": float(brand.unit_price) if brand.unit_price is not None else None,
        "availability": brand.availability(),
    }


# --------------------------------------------------------------------------
# history
# --------------------------------------------------------------------------


PERIOD_DAYS = {"today": 0, "week": 7, "month": 30, "year": 365}


@prescription_bp.get("")
@clinical_read
def list_prescriptions():
    """Every prescription written, newest first, with its clinical context.

    One row per consultation rather than per medicine: a prescription is the
    whole sheet a patient walks out with, and splitting it into its lines
    would make the same visit appear four times.

    Only completed consultations that actually prescribed something appear —
    an in-progress consultation has no prescription yet, and a visit that
    needed no medicine is not a prescription.
    """
    query = (
        Consultation.query.join(
            GeneratedPrescription,
            GeneratedPrescription.consultation_id == Consultation.id,
        )
        .filter(Consultation.status == "completed")
        .distinct()
    )

    doctor = get_current_doctor()
    if doctor:
        query = query.filter(Consultation.doctor_id == doctor.id)

    patient_id = request.args.get("patient_id", type=int)
    if patient_id:
        query = query.filter(Consultation.patient_id == patient_id)

    verified = request.args.get("verified")
    if verified == "true":
        query = query.filter(Consultation.prescription_verified_at.isnot(None))
    elif verified == "false":
        query = query.filter(Consultation.prescription_verified_at.is_(None))

    period = request.args.get("period")
    if period and period != "all":
        if period not in PERIOD_DAYS:
            allowed = ", ".join(list(PERIOD_DAYS) + ["all"])
            return error(f"period must be one of: {allowed}", status=422)
        since = datetime.combine(
            datetime.utcnow().date() - timedelta(days=PERIOD_DAYS[period]), time.min
        )
        query = query.filter(
            db.func.coalesce(Consultation.ended_at, Consultation.created_at) >= since
        )

    # Patient, doctor or medicine — what the box on this page promises. The
    # medicine is the reason this page is opened at all ("who else did we
    # give this to"); the doctor was named in the placeholder but never
    # actually searched until now.
    search = patient_search_filter(
        request.args.get("search"),
        columns=(
            ConsultationSummary.symptoms,
            ConsultationSummary.possible_diagnosis,
            GeneratedPrescription.medicine_name,
        ),
        # A doctor's name is on their user account, not the doctor row.
        extra=lambda term: [
            Consultation.doctor.has(Doctor.user.has(User.name.ilike(f"%{term}%")))
        ],
        relationship=Consultation.patient,
    )
    if search is not None:
        query = query.outerjoin(
            ConsultationSummary,
            ConsultationSummary.consultation_id == Consultation.id,
        ).filter(search)

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
    consultations = (
        query.order_by(
            db.func.coalesce(Consultation.ended_at, Consultation.created_at).desc()
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return success(
        {
            "items": [_prescription_record(c) for c in consultations],
            "meta": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": max(1, (total + page_size - 1) // page_size),
            },
        }
    )


@prescription_bp.get("/<int:consultation_id>")
@clinical_read
def get_prescription(consultation_id):
    """One prescription in full."""
    consultation = Consultation.query.get(consultation_id)
    if not consultation:
        return error("Prescription not found", status=404)

    doctor = get_current_doctor()
    if doctor and doctor.id != consultation.doctor_id:
        return error("This prescription belongs to another doctor", status=403)

    return success(_prescription_record(consultation))


def _prescription_record(consultation):
    """A prescription with everything a reader needs to judge it.

    The medicines alone are not a record — the symptoms and diagnosis that
    led to them are what make a past prescription reusable, and what a doctor
    checks before repeating it for someone else.
    """
    summary = consultation.summary
    patient = consultation.patient
    when = consultation.ended_at or consultation.started_at or consultation.created_at

    return {
        "consultation_id": consultation.id,
        "case_id": consultation.case_id,
        "session_number": consultation.session_number,
        "patient": {
            "id": patient.id if patient else None,
            "name": patient.name if patient else None,
            "code": patient.code if patient else None,
            "age": patient.age if patient else None,
            "gender": patient.gender if patient else None,
        },
        "doctor": consultation.doctor.user.name
        if consultation.doctor and consultation.doctor.user
        else None,
        "consulted_at": when.isoformat() + "Z" if when else None,
        "symptoms": summary.symptoms if summary else None,
        "diagnosis": summary.possible_diagnosis if summary else None,
        "summary": summary.summary if summary else None,
        "verified": consultation.prescription_verified_at is not None,
        "verified_by": consultation.verified_by.name if consultation.verified_by else None,
        "verified_at": consultation.prescription_verified_at.isoformat() + "Z"
        if consultation.prescription_verified_at
        else None,
        "medicines": [p.to_dict() for p in consultation.prescriptions],
    }
