"""The practice's assistants.

The mirror image of `doctor_routes.create_doctor`, and the other half of how
this practice gets its people: the doctor is the seeded account (see
`seeders/seed_doctor`), signs in first, and creates the desk's accounts from
inside the application -- one per assistant, each with credentials of their
own.

Why this way round. Somebody has to exist before anybody can sign in, and the
account that exists has to be the one that can create the others; a PA who
could mint accounts could mint a doctor's, which is the one thing the role
split exists to prevent. So account creation is the doctor's, and this module
is `doctor_only` throughout.

A PA has no profile table -- their `users` row is the whole account, see
`models/role.ROLES_WITH_PROFILE` -- so unlike a doctor there is no second row
to keep in step, and nothing here touches the clinical record.

Nothing here implements a second way to log in. The account it creates is an
ordinary `users` row with the `pa` role, hashed by `User.set_password` and read
by the existing `/api/auth/login`.
"""

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity

from portal.extensions import db
from portal.helpers import email as mailer
from portal.helpers.audit import audit
from portal.helpers.contact import normalize_email
from portal.helpers.credentials import (
    MIN_PASSWORD,
    assign_username,
    generate_temp_password,
    issue_link,
    link_lifetime_minutes,
    login_url,
)
from portal.helpers.decorators import doctor_only
from portal.helpers.response import error, success
from portal.models.role import PA, Role
from portal.models.user import User

pa_bp = Blueprint("pas", __name__)

PA_CREATED = "pa.created"


def _to_dict(user):
    """A PA as the doctor's screen shows them. The `users` row, and no more --
    there is no profile table behind a PA to draw anything else from."""
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "username": user.username,
        "is_active": user.is_active,
        "last_login_at": (
            user.last_login_at.isoformat() + "Z" if user.last_login_at else None
        ),
        "created_at": user.created_at.isoformat() + "Z" if user.created_at else None,
    }


@pa_bp.get("")
@doctor_only
def list_pas():
    """The assistants this practice has. The doctor's list of their own desk."""
    role = Role.query.filter_by(name=PA).first()
    if not role:
        return success([])
    users = User.query.filter_by(role_id=role.id).order_by(User.id).all()
    return success([_to_dict(u) for u in users])


@pa_bp.post("")
@doctor_only
def create_pa():
    """The doctor setting up an assistant's account.

    The same handover `create_doctor` performs, in the other direction, and
    deliberately identical in every part that matters -- one hashing path, one
    password floor, one credentials email, one single-use link:

      * **the doctor types a password** -- checked against MIN_PASSWORD, the
        same floor every other password on the system has to clear.
      * **the doctor leaves it blank** -- a random one is generated and
        returned once, in this response, to hand over.

    Either way the raw password is returned exactly once and never stored:
    `users.password_hash` is written by `User.set_password`. A single-use link
    to replace it is issued and mailed too, so the assistant can move to a
    password nobody else has seen -- but the account works before they use it,
    which is what "log in immediately" requires.

    The account gets the `pa` role and nothing else. What that role can reach
    is decided in one place, `helpers/decorators`, and it is the desk's work:
    registration, the appointment book, the queue, and reading the record. No
    clinical write, and no route in this module.
    """
    payload = request.get_json(silent=True) or {}

    name = (payload.get("name") or "").strip()
    if not name:
        return error("The assistant's name is required", status=422)

    email, email_error = normalize_email(payload.get("email"))
    if email_error:
        return error(email_error, status=422)
    if not email:
        return error("The assistant's email is required", status=422)

    # Checked before anything is written, so a clash reads as a clear message
    # rather than an IntegrityError from the unique index on commit.
    if User.query.filter_by(email=email).first():
        return error("An account with that email already exists", status=409)

    # Blank means "generate one". A password the doctor typed has to clear the
    # same floor as any other; one we generate clears it by construction.
    raw_password = payload.get("password") or ""
    generated = not raw_password
    if generated:
        raw_password = generate_temp_password()
    elif len(raw_password) < MIN_PASSWORD:
        return error(
            f"Password must be at least {MIN_PASSWORD} characters", status=422
        )

    # The JWT identity is a string (`create_access_token(identity=str(id))`),
    # and the column it lands in is an integer foreign key.
    creator_id = int(get_jwt_identity())

    role = Role.query.filter_by(name=PA).first()
    if not role:
        # Reconciled at every boot by helpers/bootstrap.ensure_roles, so this
        # is a database that never came up cleanly -- say so plainly rather
        # than failing on a NoneType attribute below.
        return error(
            "The 'pa' role is missing from this database. Restart the server, "
            "or run 'python -m portal.seeds'.",
            status=500,
        )

    user = User(name=name, email=email, role_id=role.id)
    user.set_password(raw_password)
    db.session.add(user)
    db.session.flush()          # assigns user.id for the username and the link

    # anita.sharma, and the numbering that keeps it unique. The same helper
    # every other account's username comes from.
    assign_username(user)

    # Issued inside the same transaction as the account, so a link can never
    # outlive the creation that triggered it.
    _raw_token, reset_link = issue_link(user, purpose="invite", issued_by_id=creator_id)
    minutes = link_lifetime_minutes("invite")

    audit(
        PA_CREATED,
        entity="user",
        entity_id=user.id,
        detail=f"PA account created for {name} ({email})",
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
        role_name=PA,
    )

    return success(
        {
            **_to_dict(user),
            # Returned once and never again -- there is no route that reads a
            # password back, because nothing stores one. The doctor hands these
            # to the assistant, who can sign in with them right away.
            "credentials": {
                "username": user.username,
                "email": user.email,
                "password": raw_password,
                # Lets the UI say "we generated this one" rather than echoing
                # back a password the doctor just typed as though it were news.
                "password_was_generated": generated,
            },
        },
        message=f"{name} can now sign in.",
        status=201,
    )
