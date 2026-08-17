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
PA_DELETED = "pa.deleted"


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

    A name and an email. **The doctor never chooses or sees the first
    password**, which is the whole shape of this route: one is generated here
    from `secrets`, hashed into `users.password_hash` by `User.set_password`,
    and sent to the assistant's own address along with the single-use link that
    replaces it. Nothing in the response carries it, nothing is logged, and no
    route reads a password back -- so the only party who ever holds the
    assistant's credentials is the assistant.

    A password in the payload is ignored rather than honoured. The field was
    removed from the form, and quietly accepting one would put the account's
    first secret back in the browser that sent it.

    **The email is not best-effort here, unlike `auth_routes` resending a
    reset.** An assistant nobody can tell the password to cannot sign in at
    all, so a send that fails takes the account with it: the mail is attempted
    before the commit and the transaction is rolled back if it does not go.
    That costs an open transaction across an SMTP call -- acceptable for
    something a practice does a handful of times -- and buys the property the
    doctor's screen depends on, that a created assistant is always an invited
    one.

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

    # Always ours, never the caller's. Twelve characters from `secrets` --
    # random, not derived from the name or anything else about the account, and
    # clearing MIN_PASSWORD by construction.
    raw_password = generate_temp_password()

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

    # Before the commit, deliberately. The mail is the only copy of the
    # password that will ever exist, so a send that fails has to undo the
    # account rather than leave one nobody can sign in to -- and the rollback
    # takes the username, the reset token and the audit row with it, because
    # they are all in this one open transaction.
    emailed = mailer.send_staff_credentials(
        user,
        temp_password=raw_password,
        reset_link=reset_link,
        login_link=login_url(),
        link_minutes=minutes,
        role_name=PA,
    )

    if not emailed:
        db.session.rollback()
        # Why it did not go, in the terms the doctor can act on.
        # `delivery_state` separates the two configuration faults from a send
        # that was attempted and refused: the first two are for an
        # administrator, and only the last is worth simply trying again.
        state = mailer.delivery_state()
        if state == "unconfigured":
            reason = (
                "No mail server is configured on this server, so the invitation "
                "could not be sent. Ask your administrator to set up email, then "
                "add them again."
            )
        elif state == "disabled":
            reason = (
                "Email sending is switched off on this server, so the invitation "
                "could not be sent. Ask your administrator to turn it on, then "
                "add them again."
            )
        else:
            reason = (
                f"The invitation to {email} could not be delivered. Check the "
                "address is right and try again."
            )
        return error(
            f"{name}'s account was not created. {reason}",
            status=502,
        )

    db.session.commit()

    # No password, and no token. The assistant's own inbox holds both; what
    # comes back here is only what the doctor's list already shows.
    return success(
        _to_dict(user),
        message=f"{name}'s sign-in details have been emailed to {email}.",
        status=201,
    )


@pa_bp.delete("/<int:pa_id>")
@doctor_only
def delete_pa(pa_id):
    """Permanently removes an assistant's account and credentials.

    Filtered by role as well as id, so this can never reach the doctor's own
    account through a guessed or mistyped id -- only a row with the `pa` role
    is ever a candidate.

    Nothing clinical hangs off a PA to block this the way a patient's
    consultation records do (see `patient_routes.delete_patient`): closing a
    case, verifying a prescription and reviewing a custom medicine request are
    all `doctor_only`, so a PA's id can never be the one recorded on any of
    those rows. What *is* tied to the account -- their notifications and any
    password-reset link issued to them -- cascades with the row
    (`ondelete="CASCADE"` in `models/notification` and
    `models/password_reset_token`), so nothing is left pointing at a deleted
    user.
    """
    role = Role.query.filter_by(name=PA).first()
    if not role:
        return error("Assistant not found", status=404)

    user = User.query.filter_by(id=pa_id, role_id=role.id).first()
    if not user:
        return error("Assistant not found", status=404)

    name, email = user.name, user.email

    audit(
        PA_DELETED,
        entity="user",
        entity_id=user.id,
        detail=f"PA account deleted -- {name} ({email})",
    )
    db.session.delete(user)
    try:
        db.session.commit()
    except Exception as exc:  # noqa: BLE001 - surface a DB failure as clean JSON
        db.session.rollback()
        return error(f"Could not delete this assistant: {exc}", status=500)

    return success({"id": pa_id}, message=f"{name}'s account has been removed.")
