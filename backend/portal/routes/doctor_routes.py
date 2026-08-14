"""The practice's doctor.

One row and two routes, where the hospital version had a directory, a
department filter, a rota-driven availability board and an account-creation
endpoint. None of those survive a practice of one: there is nobody to search
among, no department to filter by, no rota, and the doctor's account is
created at boot (see `seeders/seed_accounts`) rather than by an administrator
who no longer exists.

What is left is what a client actually asks: who is the doctor, and what goes
at the top of their prescriptions.
"""

from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.decorators import doctor_only
from portal.helpers.practice import practice_doctor
from portal.helpers.response import error, success
from portal.models.doctor import Doctor

doctor_bp = Blueprint("doctors", __name__)


@doctor_bp.get("")
@jwt_required()
def list_doctors():
    """The practice's doctors.

    Still a list, and still plural. A client that wants the one doctor should
    read `/doctors/practice` below; this stays a collection so a practice that
    takes on a second doctor does not need every caller rewritten.
    """
    doctors = Doctor.query.join(Doctor.user).order_by(Doctor.id).all()
    return success([d.to_dict() for d in doctors])


@doctor_bp.get("/practice")
@jwt_required()
def get_practice_doctor():
    """Who this practice's doctor is — the one every workflow resolves to.

    Null rather than a 404 when no doctor has been set up: "there is no doctor
    yet" is a state the UI should render as a prompt, not as a broken request.
    """
    doctor = practice_doctor()
    return success(doctor.to_dict() if doctor else None)


@doctor_bp.patch("/practice")
@doctor_only
def update_practice_doctor():
    """The doctor editing their own practice details.

    Theirs alone: these fields are printed at the top of every prescription and
    report the practice issues, so they are the doctor's signature in the same
    sense the prescription itself is. The PA maintains the appointment book,
    not the credentials on the letterhead.
    """
    doctor = get_current_doctor()
    if not doctor:
        return error("No doctor profile on this account", status=404)

    payload = request.get_json(silent=True) or {}
    for field, limit in (
        ("specialization", 150),
        ("qualification", 200),
        ("registration_no", 50),
        ("practice_name", 200),
    ):
        if field in payload:
            setattr(doctor, field, (payload.get(field) or "").strip()[:limit] or None)

    db.session.commit()
    return success(doctor.to_dict(), message="Practice details updated")
