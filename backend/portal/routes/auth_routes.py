import os
from datetime import datetime

from flask import Blueprint, request, send_from_directory
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers import email as mailer
from portal.helpers.audit import audit
from portal.helpers.contact import normalize_email
from portal.helpers.credentials import (
    MIN_PASSWORD,
    find_link,
    issue_link,
    link_lifetime_minutes,
    login_url,
)
from portal.helpers.response import error, success
from portal.helpers.uploads import ImageUploadError, delete_image, save_image, upload_dir
from portal.models.user import User

auth_bp = Blueprint("auth", __name__)

AVATARS_SUBDIR = "avatars"

PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"
PASSWORD_RESET_COMPLETED = "auth.password_reset_completed"


def _find_by_identifier(identifier):
    """The account for a username *or* an email address.

    One field on the sign-in form, because making somebody remember which of
    their two identifiers this particular system wanted is a support call, not
    a security control. Which one they typed is inferred from the '@'.

    Both comparisons are on the lowercased value, matching how each column is
    written: emails are lowercased on the way in throughout, and
    `helpers/credentials` only ever generates a lowercase username.
    """
    value = (identifier or "").strip().lower()
    if not value:
        return None
    if "@" in value:
        return User.query.filter_by(email=value).first()
    return User.query.filter(db.func.lower(User.username) == value).first()


@auth_bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    # `email` is still accepted under its old name: an older frontend build
    # sitting in somebody's browser cache must keep working across this
    # deploy, and it only ever sent that key.
    identifier = payload.get("identifier") or payload.get("username") or payload.get("email")
    identifier = (identifier or "").strip()
    password = payload.get("password") or ""

    if not identifier or not password:
        return error("Username or email and password are required", status=422)

    # No email-shape or domain check here. `ALLOWED_EMAIL_DOMAINS` constrains
    # what a NEW address may be when the hospital is the one creating the
    # record (see `create_patient`, `update_me`); signing in looks up an
    # account that already exists, on whatever domain it was created with,
    # and `_find_by_identifier` does that lookup with no domain opinion of
    # its own. Rejecting a real, working login here for the wrong reason
    # locked out any account not on the two default domains.
    user = _find_by_identifier(identifier)
    if not user or not user.check_password(password):
        # One message for "no such account" and "wrong password", so this
        # cannot be used to find out who has an account here.
        return error("Invalid username or password", status=401)

    if not user.is_active:
        return error("This account has been deactivated", status=403)

    claims = {"role": user.role.name}
    access_token = create_access_token(identity=str(user.id), additional_claims=claims)
    refresh_token = create_refresh_token(identity=str(user.id), additional_claims=claims)

    user.last_login_at = datetime.utcnow()
    db.session.commit()

    return success(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict(),
        },
        message="Login successful",
    )


@auth_bp.get("/me")
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return error("User not found", status=404)
    return success(user.to_dict())


@auth_bp.patch("/me")
@jwt_required()
def update_me():
    """Lets a signed-in user edit their own account details.

    Deliberately narrow: role, is_active and department are org structure, not
    self-service — changing those stays an admin action.
    """
    user = User.query.get(get_jwt_identity())
    if not user:
        return error("User not found", status=404)

    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            return error("Name cannot be empty", status=422)
        user.name = name

    if "email" in payload:
        email, email_error = normalize_email(payload.get("email"))
        if email_error:
            return error(email_error, status=422)
        if not email:
            return error("Email is required", status=422)
        clash = User.query.filter(User.email == email, User.id != user.id).first()
        if clash:
            return error("That email is already in use", status=409)
        user.email = email

    # Doctor-only fields live on the doctor profile, not the user row.
    if user.doctor_profile:
        if "specialization" in payload:
            user.doctor_profile.specialization = (payload.get("specialization") or "").strip() or None
        if "registration_no" in payload:
            user.doctor_profile.registration_no = (payload.get("registration_no") or "").strip() or None

    db.session.commit()
    return success(user.to_dict(), message="Profile updated")


@auth_bp.post("/me/avatar")
@jwt_required()
def upload_avatar():
    user = User.query.get(get_jwt_identity())
    if not user:
        return error("User not found", status=404)

    try:
        filename = save_image(request.files.get("avatar"), AVATARS_SUBDIR)
    except ImageUploadError as exc:
        return error(exc.message, status=exc.status)

    previous = user.avatar_path
    user.avatar_path = filename
    db.session.commit()

    delete_image(previous, AVATARS_SUBDIR)

    return success(user.to_dict(), message="Profile picture updated")


@auth_bp.delete("/me/avatar")
@jwt_required()
def delete_avatar():
    user = User.query.get(get_jwt_identity())
    if not user:
        return error("User not found", status=404)

    previous = user.avatar_path
    user.avatar_path = None
    db.session.commit()

    delete_image(previous, AVATARS_SUBDIR)

    return success(user.to_dict(), message="Profile picture removed")


@auth_bp.get("/avatar/<path:filename>")
def serve_avatar(filename):
    """Serves an avatar image.

    Unauthenticated on purpose: an <img> tag cannot send the Authorization
    header, and blob-fetching every avatar would defeat browser caching. The
    filename is 32 random hex chars, so a URL is only reachable by someone
    who was already shown it. send_from_directory rejects traversal itself.
    """
    directory = upload_dir(AVATARS_SUBDIR)
    if not os.path.exists(os.path.join(directory, filename)):
        return error("Image not found", status=404)
    return send_from_directory(directory, filename, max_age=3600)


@auth_bp.post("/password")
@jwt_required()
def change_password():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return error("User not found", status=404)

    payload = request.get_json(silent=True) or {}
    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""

    if not user.check_password(current_password):
        # Deliberately not 401: the frontend's global interceptor treats any
        # 401 as "session expired" and force-logs-out — but this is just a
        # wrong secondary credential, not an invalid/expired JWT.
        return error("Current password is incorrect", status=422)
    # MIN_PASSWORD, not the 6 this route used to enforce on its own. The two
    # ways to set a password — here, and through a reset link — now agree,
    # which they have to: a rule a user can get around by picking the other
    # form is not a rule.
    if len(new_password) < MIN_PASSWORD:
        return error(
            f"New password must be at least {MIN_PASSWORD} characters", status=422
        )

    user.set_password(new_password)
    db.session.commit()

    return success(message="Password updated")


# -- Forgotten passwords -----------------------------------------------------
#
# Three routes, deliberately separate:
#
#   POST /password/forgot   -- ask for a link (unauthenticated)
#   GET  /password/reset    -- is this link still good? (unauthenticated)
#   POST /password/reset    -- spend it and set a password (unauthenticated)
#
# The GET exists so the reset page can say "this link has expired, ask for
# another" before somebody types a password into a form that was never going
# to work. It reveals only what the holder of the link already knows.


@auth_bp.post("/password/forgot")
def forgot_password():
    """Emails a single-use reset link, if the identifier matches an account.

    **Always answers the same way.** A different response for a real account
    than for an invented one turns this route into a way to enumerate the
    hospital's staff, and an unauthenticated one at that. So: same message,
    whether the address exists, whether the account is disabled, and whether
    the mail server accepted the message.
    """
    payload = request.get_json(silent=True) or {}
    identifier = payload.get("identifier") or payload.get("email") or ""

    # Same reasoning as `login`: this looks up an account that already
    # exists, so the domain rule for creating a new one does not apply, and
    # applying it anyway would refuse a reset to a real account for a reason
    # that has nothing to do with whether it exists.
    answer = success(
        message=(
            "If that account exists, a reset link is on its way. It expires "
            "shortly, so use it as soon as it arrives."
        )
    )

    user = _find_by_identifier(identifier)
    # A disabled account is skipped silently. Its holder cannot sign in with a
    # new password anyway, and sending the mail would tell whoever asked that
    # the account is real.
    if not user or not user.is_active:
        return answer

    _raw, link = issue_link(user, purpose="reset")
    minutes = link_lifetime_minutes("reset")
    audit(
        PASSWORD_RESET_REQUESTED,
        entity="user",
        entity_id=user.id,
        detail=f"Password reset link issued for {user.email}",
        user_id=user.id,
    )
    db.session.commit()

    # After the commit, for the same reason staff creation mails after its
    # own: SMTP cannot be rolled back.
    mailer.send_password_reset(user, reset_link=link, link_minutes=minutes)
    return answer


def _needs_current_password(link):
    """Whether this link's form asks for the password the account has now.

    Yes for an **invite**: the staff member was emailed a temporary password
    minutes earlier, so they have one to type, and asking for it means setting
    a password takes both the link *and* the temporary password. A forwarded
    email, or a link read out of a shoulder-surfed inbox, is then not enough
    on its own.

    No for a **reset**: somebody who pressed "forgot password" by definition
    cannot supply their current one. Demanding it there would not be stricter,
    it would make the flow impossible and leave them locked out for good --
    which is precisely the situation the flow exists to end.

    So the field is driven by the link, not hardcoded on the form. One screen,
    two shapes, and neither is weakened to match the other.
    """
    return link.purpose == "invite"


@auth_bp.get("/password/reset")
def check_reset_link():
    """Whether a link is still usable, and who it belongs to.

    Returns the name and username so the page can say "Set a password for
    Anita Sharma (anita.sharma)" — confirmation for the recipient that the
    link is theirs, and it discloses nothing to anyone else, since holding the
    token is already the harder half.
    """
    token = request.args.get("token") or ""
    link = find_link(token)

    if not link or not link.user:
        return error("This link is not valid. Ask your administrator for a new one.", status=404)
    if link.used_at:
        return error(
            "This link has already been used. If you did not use it, tell your "
            "administrator immediately.",
            status=410,
        )
    if link.is_expired:
        return error(
            "This link has expired. Use “Forgot password” on the sign-in page to "
            "get a new one.",
            status=410,
        )
    if not link.user.is_active:
        return error("This account has been deactivated.", status=403)

    return success(
        {
            "name": link.user.name,
            "username": link.user.username,
            "email": link.user.email,
            "purpose": link.purpose,
            "expires_at": link.expires_at.isoformat() + "Z",
            "min_password": MIN_PASSWORD,
            # Whether the form should show a "current password" field. True for
            # an invite, false for a forgotten password -- see
            # `_needs_current_password` for why the two cannot be the same.
            "requires_current_password": _needs_current_password(link),
        }
    )


@auth_bp.post("/password/reset")
def reset_password():
    """Spends a link and sets the password the staff member chose.

    Single use is enforced here and nowhere else, so the marking and the new
    hash are written in one transaction: a crash between them would otherwise
    leave a spent link that still worked, or a changed password whose link
    could be replayed.

    An invite link additionally requires the temporary password the same email
    carried -- see `_needs_current_password`.
    """
    payload = request.get_json(silent=True) or {}
    token = payload.get("token") or ""
    current_password = payload.get("current_password") or ""
    new_password = payload.get("password") or payload.get("new_password") or ""
    confirm = payload.get("confirm_password")

    link = find_link(token)
    if not link or not link.user:
        return error("This link is not valid. Ask your administrator for a new one.", status=404)
    if not link.is_usable:
        return error(
            "This link has already been used or has expired. Use “Forgot password” "
            "on the sign-in page to get a new one.",
            status=410,
        )
    if not link.user.is_active:
        return error("This account has been deactivated.", status=403)

    user = link.user

    if _needs_current_password(link):
        if not current_password:
            return error(
                "Enter the temporary password from your email", status=422
            )
        if not user.check_password(current_password):
            # The link is deliberately NOT spent here. A mistyped temporary
            # password is the likeliest thing to happen on this form, and
            # burning the link over a typo would lock out the very person it
            # was issued to. Guessing is not a route in either: the temporary
            # password is twelve random characters, and the link expires.
            return error(
                "That temporary password is not correct. Copy it from your "
                "welcome email exactly — it is case-sensitive.",
                status=422,
            )

    if len(new_password) < MIN_PASSWORD:
        return error(f"Password must be at least {MIN_PASSWORD} characters", status=422)
    if confirm is not None and confirm != new_password:
        return error("Those passwords do not match", status=422)
    if current_password and current_password == new_password:
        return error(
            "Your new password must be different from the temporary one", status=422
        )
    user.set_password(new_password)
    link.used_at = datetime.utcnow()
    # Any other link outstanding for this account dies with it — including the
    # invite link, if they reset from a "forgot password" mail before using
    # the one in their welcome email.
    for other in user.reset_tokens:
        if other.id != link.id and other.used_at is None:
            other.used_at = datetime.utcnow()

    audit(
        PASSWORD_RESET_COMPLETED,
        entity="user",
        entity_id=user.id,
        detail=f"Password set via {link.purpose} link",
        user_id=user.id,
    )
    db.session.commit()

    # Best-effort, and never blocks the response: the password is already
    # changed, and this is the notification that tells the account's owner if
    # it wasn't them who changed it.
    mailer.send_password_changed(user, login_link=login_url())

    return success(
        {"username": user.username, "email": user.email},
        message="Password set. You can sign in with it now.",
    )


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    from flask_jwt_extended import get_jwt

    user_id = get_jwt_identity()
    claims = {"role": get_jwt().get("role")}
    access_token = create_access_token(identity=user_id, additional_claims=claims)
    return success({"access_token": access_token})


@auth_bp.post("/logout")
@jwt_required()
def logout():
    # Stateless JWT: the client discards the token. A server-side revocation
    # list can be added later if we need immediate invalidation.
    return success(message="Logged out")
