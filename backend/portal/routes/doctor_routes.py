"""The practice's doctor.

Where the hospital version had a directory, a department filter and a
rota-driven availability board, this has a list of one: there is nobody to
search among, no department to filter by and no rota.

**The doctor is created by the PA, not by a seeder.** There used to be a
default doctor written into the repository and inserted at every boot, which
meant every checkout of MediAssist AI came up as the same fictional person and
a real practice's first job was to edit a row it never asked for. It is gone.
A fresh database now has a PA and no doctor, and `create_doctor` below is how
the practice gets one -- the PA enters the details the doctor gives them, the
account and its login are made in one transaction, and the doctor can sign in
with those credentials straight away.

Nothing here implements a second way to log in. The account it creates is an
ordinary `users` row with the `doctor` role, hashed by `User.set_password` and
read by the existing `/api/auth/login`.
"""

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers import email as mailer
from portal.helpers.audit import audit
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.contact import normalize_email
from portal.helpers.credentials import (
    MIN_PASSWORD,
    assign_username,
    generate_temp_password,
    issue_link,
    link_lifetime_minutes,
    login_url,
)
from portal.helpers.decorators import doctor_only, front_desk_only
from portal.helpers.practice import practice_doctor
from portal.helpers.response import error, success
from portal.models.doctor import Doctor
from portal.models.role import DOCTOR, Role
from portal.models.user import User

doctor_bp = Blueprint("doctors", __name__)

DOCTOR_CREATED = "doctor.created"

# What a doctor's row says when the PA leaves the field blank. A practice that
# has not told us the specialization is a General Medicine practice far more
# often than it is nothing at all, and both are editable by the doctor
# afterwards on their own practice-details screen.
DEFAULT_SPECIALIZATION = "General Medicine"


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


@doctor_bp.post("")
@front_desk_only
def create_doctor():
    """The PA setting up a doctor's account.

    The desk's work, not the doctor's: the doctor cannot create their own
    account because they have no way to sign in until it exists. The PA is the
    only role that can reach this, and the account it makes is linked back to
    them through `doctors.created_by_user_id`.

    Two ways to give it a password, and both end with an account the doctor can
    sign in to immediately:

      * **the PA types one** -- the doctor gave them a password to set, or the
        two are sitting at the same desk. Checked against MIN_PASSWORD, the
        same floor every other password on the system has to clear.
      * **the PA leaves it blank** -- a random one is generated and returned
        once, in this response, for the PA to hand over.

    Either way the raw password is returned to the PA exactly once and never
    stored: `users.password_hash` is written by `User.set_password`, the same
    hashing every other account uses. A single-use link to replace it is also
    issued and mailed, so the doctor can move to a password nobody else has
    seen -- but the account works before they use it, which is what "log in
    immediately" requires.

    One transaction. A doctor with no `doctors` row is a half-formed account:
    `helpers/practice.practice_doctor` would not find them, so nothing could be
    booked and every scoping rule would read them as the PA.
    """
    payload = request.get_json(silent=True) or {}

    name = (payload.get("name") or "").strip()
    if not name:
        return error("The doctor's name is required", status=422)

    email, email_error = normalize_email(payload.get("email"))
    if email_error:
        return error(email_error, status=422)
    if not email:
        return error("The doctor's email is required", status=422)

    # Checked before anything is written, so a clash reads as a clear message
    # rather than an IntegrityError from the unique index on commit.
    if User.query.filter_by(email=email).first():
        return error("An account with that email already exists", status=409)

    # Blank means "generate one". A password the PA typed has to clear the same
    # floor as any other; one we generate clears it by construction.
    raw_password = payload.get("password") or ""
    generated = not raw_password
    if generated:
        raw_password = generate_temp_password()
    elif len(raw_password) < MIN_PASSWORD:
        return error(
            f"Password must be at least {MIN_PASSWORD} characters", status=422
        )

    # The JWT identity is a string (`create_access_token(identity=str(id))`),
    # and both places it lands below are integer foreign keys.
    creator_id = int(get_jwt_identity())

    role = Role.query.filter_by(name=DOCTOR).first()
    if not role:
        # Reconciled at every boot by helpers/bootstrap.ensure_roles, so this
        # is a database that never came up cleanly -- say so plainly rather
        # than failing on a NoneType attribute below.
        return error(
            "The 'doctor' role is missing from this database. Restart the "
            "server, or run 'python -m portal.seeds'.",
            status=500,
        )

    user = User(name=name, email=email, role_id=role.id)
    user.set_password(raw_password)
    db.session.add(user)
    db.session.flush()          # assigns user.id for the profile and username

    # sandeep.viswanadh, and the numbering that keeps it unique. The same
    # helper every other account's username comes from.
    assign_username(user)

    doctor = Doctor(
        user_id=user.id,
        specialization=(payload.get("specialization") or "").strip()[:150]
        or DEFAULT_SPECIALIZATION,
        qualification=(payload.get("qualification") or "").strip()[:200] or None,
        registration_no=(payload.get("registration_no") or "").strip()[:50] or None,
        practice_name=(payload.get("practice_name") or "").strip()[:200] or None,
        # The link the whole column exists for.
        created_by_user_id=creator_id,
    )
    db.session.add(doctor)
    db.session.flush()          # assigns doctor.id for the audit row below

    # Issued inside the same transaction as the account, so a link can never
    # outlive the creation that triggered it.
    _raw_token, reset_link = issue_link(user, purpose="invite", issued_by_id=creator_id)
    minutes = link_lifetime_minutes("invite")

    audit(
        DOCTOR_CREATED,
        entity="doctor",
        entity_id=doctor.id,
        detail=f"Doctor account created for {name} ({email})",
    )
    db.session.commit()

    # After the commit, and never blocking the response: SMTP cannot be rolled
    # back, and the account is already usable without the mail arriving.
    mailer.send_staff_credentials(
        user,
        temp_password=raw_password,
        reset_link=reset_link,
        login_link=login_url(),
        link_minutes=minutes,
        role_name=DOCTOR,
    )

    return success(
        {
            **doctor.to_dict(),
            # Returned once and never again -- there is no route that reads a
            # password back, because nothing stores one. The PA hands these to
            # the doctor, who can sign in with them right away.
            "credentials": {
                "username": user.username,
                "email": user.email,
                "password": raw_password,
                # Lets the UI say "we generated this one" rather than echoing
                # back a password the PA just typed as though it were news.
                "password_was_generated": generated,
            },
        },
        message=f"Dr. {name} can now sign in.",
        status=201,
    )


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
