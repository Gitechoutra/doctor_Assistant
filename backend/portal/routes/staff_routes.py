"""Staff Management. Admin only.

Deliberately generic: the hospital's real onboarding process is not known yet,
so this records what an administrator would sensibly type and keeps the
role-specific parts in one place (`_sync_role_profile`) that can be rewritten
without touching the rest.

Three invariants hold whatever the client later asks for:

  * a clinical role always gets its profile row in the same transaction as the
    account -- a `doctor` with no `doctors` row reads as unrestricted in
    `patient_scope`, i.e. able to see every patient
  * a staff account is never hard-deleted once it has clinical history, because
    consultations, patients and nursing records hold non-null foreign keys
    into it. Disabling is the safe operation, and it is the default.
  * **an administrator never chooses, sees or keeps a staff member's
    password.** They pick a role and type a name; the username is derived from
    that name, the first password is random and mailed to the staff member's
    own address alongside a single-use link that replaces it. The only
    circumstance in which this route hands a password back to the admin is
    when the email demonstrably did not go -- see `_issue_credentials`.

Every role goes through the same door. A doctor, a nurse, a pharmacist, a lab
technician and an other_staff account differ in their profile row and in what
`helpers/decorators` lets them reach; they do not differ in how they are
created, named, or how they get their password.
"""

from datetime import date, datetime

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.exc import IntegrityError

from portal.extensions import db
from portal.helpers import email as mailer
from portal.helpers.audit import audit
from portal.helpers.broadcast import dashboard_changed
from portal.helpers.contact import normalize_email, normalize_phone
from portal.helpers.credentials import (
    assign_username,
    generate_temp_password,
    issue_link,
    link_lifetime_minutes,
    login_url,
    unique_username,
)
from portal.helpers.decorators import role_required
from portal.helpers.response import error, success
from portal.models.branch import Branch
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.nurse import Nurse
from portal.models.pharmacist import Pharmacist
from portal.models.role import ROLES_WITH_PROFILE, STAFF_ROLES, Role
from portal.models.staff_profile import DESIGNATIONS, GENDERS, SHIFTS, StaffProfile
from portal.models.user import User

staff_bp = Blueprint("staff", __name__)

MAX_AGE_YEARS = 100

STAFF_CREATED = "staff.created"
STAFF_UPDATED = "staff.updated"
STAFF_STATUS_CHANGED = "staff.status_changed"
STAFF_DELETED = "staff.deleted"
# Recorded separately from staff.created because it can happen again on its
# own: a resend invalidates the previous password and link, and "who reissued
# this person's credentials, and when" is a question an inspection asks.
STAFF_CREDENTIALS_SENT = "staff.credentials_sent"

# Fields the administrator types that live on the staff profile. Listed once so
# create and edit cannot drift apart.
PROFILE_TEXT_FIELDS = (
    ("designation", 100),
    ("employee_code", 50),
    ("registration_no", 60),
    ("specialization", 150),
    ("lab_department", 120),
    ("qualification", 150),
    ("notes", 2000),
)


def _text(payload, field, limit):
    value = payload.get(field)
    if value is None:
        return None
    return str(value).strip()[:limit] or None


def _parse_date(raw, field, *, past_only=False):
    """Returns (date, error). Both None means the field was absent."""
    if not raw:
        return None, None
    try:
        parsed = datetime.strptime(str(raw), "%Y-%m-%d").date()
    except ValueError:
        return None, f"{field} must be in YYYY-MM-DD format"
    if past_only:
        today = date.today()
        if parsed > today:
            return None, f"{field} cannot be in the future"
        if parsed.year < today.year - MAX_AGE_YEARS:
            return None, f"{field} is not a plausible date"
    return parsed, None


def _clinical_record_count(user):
    """How much history would be orphaned by deleting this account.

    Only the tables whose foreign key into `doctors`/`nurses` is NOT NULL --
    those are the ones a delete would actually break.
    """
    from portal.models.consultation import Consultation
    from portal.models.nursing_assignment import NursingAssignment
    from portal.models.patient import Patient

    counts = {}
    if user.doctor_profile:
        did = user.doctor_profile.id
        counts["consultations"] = Consultation.query.filter_by(doctor_id=did).count()
        counts["patients"] = Patient.query.filter_by(assigned_doctor_id=did).count()
        counts["nursing_assignments"] = NursingAssignment.query.filter_by(doctor_id=did).count()
    if user.nurse_profile:
        nid = user.nurse_profile.id
        counts["nursing_assignments"] = counts.get("nursing_assignments", 0) + (
            NursingAssignment.query.filter_by(nurse_id=nid).count()
        )
    return {k: v for k, v in counts.items() if v}


def _sync_role_profile(user, role_name, profile, payload):
    """Creates or updates the operational profile a clinical role needs.

    The one place that knows how HR fields map onto the tables the clinical
    code joins against. Rewriting the onboarding process should mean rewriting
    this function and nothing else.

    Returns an error message, or None.
    """
    department_id = profile.department_id
    branch_id = profile.branch_id

    if role_name == "doctor":
        if not department_id:
            return "A doctor needs a department"
        row = user.doctor_profile or Doctor(user_id=user.id)
        row.department_id = department_id
        row.specialization = profile.specialization
        row.registration_no = profile.registration_no
        db.session.add(row)

    elif role_name == "nurse":
        # No department requirement, unlike a doctor.
        #
        # A doctor's department is operational: an OP is raised against a
        # department and only a doctor in it can pick the patient up, so an
        # account without one cannot do its job. A nurse's is not — nursing
        # work arrives by direct assignment from the treating doctor, never by
        # department.
        #
        # This route used to demand one anyway, which made it stricter than
        # everything around it: `nurses.department_id` is nullable, the only
        # query that filters on it does so optionally and no caller passes it,
        # and POST /nursing/nurses has always accepted `department_id or None`.
        # That inconsistency is what made hiding the field on the staff form
        # produce a 422 the administrator had no way to satisfy.
        row = user.nurse_profile or Nurse(user_id=user.id)
        row.department_id = department_id
        row.employee_no = profile.employee_code
        # The nurse table's own shift enum matches the staff one.
        row.shift = profile.shift
        db.session.add(row)

    elif role_name == "pharmacist":
        if not branch_id:
            return "A pharmacist needs a branch"
        row = user.pharmacist_profile or Pharmacist(user_id=user.id, branch_id=branch_id)
        row.branch_id = branch_id
        row.license_no = profile.registration_no
        db.session.add(row)

    return None


def _apply_profile(profile, payload):
    """Copies the submitted HR fields onto the profile. Returns an error or None."""
    for field, limit in PROFILE_TEXT_FIELDS:
        if field in payload:
            setattr(profile, field, _text(payload, field, limit))

    if "phone" in payload:
        # Optional, but exact when given -- see helpers/contact.
        phone, phone_error = normalize_phone(payload.get("phone"))
        if phone_error:
            return phone_error
        profile.phone = phone

    if "gender" in payload:
        gender = (payload.get("gender") or "").strip().lower() or None
        if gender and gender not in GENDERS:
            return f"gender must be one of: {', '.join(GENDERS)}"
        profile.gender = gender

    if "shift" in payload:
        shift = (payload.get("shift") or "").strip().lower() or None
        if shift and shift not in SHIFTS:
            return f"shift must be one of: {', '.join(SHIFTS)}"
        profile.shift = shift

    for field, past_only in (("date_of_birth", True), ("joined_on", False)):
        if field in payload:
            parsed, err = _parse_date(payload.get(field), field, past_only=past_only)
            if err:
                return err
            setattr(profile, field, parsed)

    if "years_experience" in payload:
        raw = payload.get("years_experience")
        if raw in (None, ""):
            profile.years_experience = None
        else:
            try:
                years = int(raw)
            except (TypeError, ValueError):
                return "years_experience must be a whole number"
            if not 0 <= years <= 70:
                return "years_experience must be between 0 and 70"
            profile.years_experience = years

    if "department_id" in payload:
        dept_id = payload.get("department_id") or None
        if dept_id and not db.session.get(Department, dept_id):
            return "Department not found"
        profile.department_id = dept_id

    if "branch_id" in payload:
        branch_id = payload.get("branch_id") or None
        if branch_id and not db.session.get(Branch, branch_id):
            return "Branch not found"
        profile.branch_id = branch_id

    if "extra" in payload:
        extra = payload.get("extra")
        if extra is not None and not isinstance(extra, dict):
            return "extra must be an object"
        profile.extra = extra

    return None


def _issue_credentials(user, *, purpose, reissued):
    """Gives `user` a fresh password and a fresh link, then mails both.

    Called by create and by the resend route, so the two cannot drift: there
    is one definition of what a staff member receives.

    Ordering matters and is not incidental:

      1. the password and the token row are written inside the caller's
         transaction and committed with it -- mailing credentials for an
         account that then failed to save is the one outcome worth ruling out
         structurally;
      2. the email goes afterwards, because SMTP is not transactional and a
         message cannot be un-sent by a rollback.

    Returns what the route tells the administrator. `temp_password` is present
    **only when the mail did not go**: the account exists at that point and is
    otherwise unreachable, so refusing to show it would strand a real person
    for the sake of a rule that has already done its work everywhere it can.
    Every other path returns None there.

    One caveat worth knowing on a deployment: with no SMTP configured,
    `helpers/email` writes the whole unsent message -- temporary password
    included -- to logs/portal.log. That is what makes local development
    workable, and it means logs/ on a machine with mail switched off should be
    treated as containing credentials. Configure SMTP and it stops happening.
    """
    temp_password = generate_temp_password()
    user.set_password(temp_password)

    _raw_token, link = issue_link(
        user, purpose=purpose, issued_by_id=_current_user_id()
    )
    minutes = link_lifetime_minutes(purpose)

    audit(
        STAFF_CREDENTIALS_SENT,
        entity="user",
        entity_id=user.id,
        detail=(
            f"{'Reissued' if reissued else 'Issued'} sign-in credentials for "
            f"{user.name} ({user.username})"
        ),
    )
    db.session.commit()

    delivered = mailer.send_staff_credentials(
        user,
        temp_password=temp_password,
        reset_link=link,
        login_link=login_url(),
        link_minutes=minutes,
        role_name=user.role.name if user.role else None,
        reissued=reissued,
    )

    return {
        "username": user.username,
        "email_sent": delivered,
        "email_state": mailer.delivery_state(),
        "email_configured": mailer.is_configured(),
        "reset_link_expires_in_minutes": minutes,
        # See the docstring. None whenever the message actually went.
        "temp_password": None if delivered else temp_password,
        "reset_link": None if delivered else link,
    }


def _current_user_id():
    try:
        return int(get_jwt_identity())
    except (TypeError, ValueError):
        return None


def _credentials_message(lead, email, outcome):
    """What the administrator reads after an account is created or reissued.

    Four outcomes, not two. All three failing ones leave the admin holding the
    only copy of the credentials, but each needs something different done
    about it — set up a mail server, turn sending back on, or retry — and
    telling them apart is the difference between a five-second fix and an
    afternoon spent editing a file that was already correct.
    """
    if outcome["email_sent"]:
        return f"{lead} — sign-in details emailed to {email}"

    tail = "The sign-in details shown are the only copy"
    if outcome["email_state"] == "unconfigured":
        return f"{lead}, but no mail server is configured, so nothing was sent. {tail}."
    if outcome["email_state"] == "disabled":
        return (
            f"{lead}, but email sending is switched off, so nothing was sent. {tail} — "
            "turn it back on with enabled = true in the ini's mail section."
        )
    return (
        f"{lead}, but the email to {email} could not be delivered. {tail} — "
        "pass them on securely, or try again."
    )


def _serialise(user):
    """One staff member, flattened for the table the admin reads."""
    profile = user.staff_profile
    data = {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "email": user.email,
        "role": user.role.name if user.role else None,
        "is_active": user.is_active,
        "avatar_url": user.avatar_url,
        "last_login_at": user.last_login_at.isoformat() + "Z" if user.last_login_at else None,
        "profile": profile.to_dict() if profile else None,
        # Whether this account has clinical history. Drives whether the UI
        # offers Delete or only Disable.
        "has_records": bool(_clinical_record_count(user)),
    }
    # Department is resolved from the operational profile first, since that is
    # what the clinical code actually uses to scope work.
    operational = user.doctor_profile or user.nurse_profile
    data["department"] = (
        operational.department.name
        if operational and operational.department
        else (profile.department.name if profile and profile.department else None)
    )
    return data


@staff_bp.get("")
@role_required("admin")
def list_staff():
    """Every staff account, filterable by role and status, searchable by name,
    username, email, phone or employee code."""
    query = User.query.join(Role, User.role_id == Role.id)

    role_name = (request.args.get("role") or "").strip()
    if role_name and role_name != "all":
        if role_name not in STAFF_ROLES and role_name != "admin":
            return error("Unknown role", status=422)
        query = query.filter(Role.name == role_name)

    status = (request.args.get("status") or "all").strip()
    if status == "active":
        query = query.filter(User.is_active.is_(True))
    elif status == "inactive":
        query = query.filter(User.is_active.is_(False))

    term = (request.args.get("search") or "").strip()
    if term:
        like = f"%{term}%"
        query = query.outerjoin(StaffProfile, StaffProfile.user_id == User.id).filter(
            db.or_(
                User.name.ilike(like),
                # A staff member on the phone reads out their username, not
                # the name the record was filed under.
                User.username.ilike(like),
                User.email.ilike(like),
                StaffProfile.phone.ilike(like),
                StaffProfile.employee_code.ilike(like),
            )
        )

    users = query.order_by(Role.name, User.name).all()

    counts = dict(
        db.session.query(Role.name, db.func.count(User.id))
        .join(User, User.role_id == Role.id)
        .group_by(Role.name)
        .all()
    )
    return success(
        {
            "items": [_serialise(u) for u in users],
            "total": User.query.count(),
            "by_role": counts,
            "active": User.query.filter_by(is_active=True).count(),
        }
    )


@staff_bp.get("/options")
@role_required("admin")
def staff_options():
    """Everything the dynamic form needs to render itself."""
    return success(
        {
            "roles": list(STAFF_ROLES),
            "roles_with_profile": list(ROLES_WITH_PROFILE),
            "designations": DESIGNATIONS,
            "genders": list(GENDERS),
            "shifts": list(SHIFTS),
            "departments": [
                {"id": d.id, "name": d.name}
                for d in Department.query.order_by(Department.name).all()
            ],
            "branches": [
                {"id": b.id, "name": b.name}
                for b in Branch.query.filter_by(is_active=True).order_by(Branch.name).all()
            ],
        }
    )


@staff_bp.get("/<int:user_id>")
@role_required("admin")
def get_staff(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return error("Staff member not found", status=404)
    data = _serialise(user)
    data["record_counts"] = _clinical_record_count(user)
    return success(data)


@staff_bp.post("")
@role_required("admin")
def create_staff():
    """Creates one staff login, whatever the role.

    The administrator supplies a role, a name, an email and the role's own HR
    fields. They do not supply a username or a password: see the module
    docstring for why, and `helpers/credentials` for how both are derived.
    """
    payload = request.get_json(silent=True) or {}

    name = _text(payload, "name", 150)
    email, email_error = normalize_email(payload.get("email"))
    role_name = payload.get("role")

    if not name:
        return error("Full name is required", status=422)
    if email_error:
        return error(email_error, status=422)
    # The credentials email -- username, first password, single-use link -- is
    # the only way this account can ever be signed in to, so an address is not
    # optional here the way it is on a patient record.
    if not email:
        return error("Email is required", status=422)
    if role_name not in STAFF_ROLES:
        return error(f"role must be one of: {', '.join(STAFF_ROLES)}", status=422)
    if User.query.filter_by(email=email).first():
        return error("An account with that email already exists", status=409)

    role = Role.query.filter_by(name=role_name).first()
    if not role:
        return error(f"The {role_name} role is missing — run the seeder", status=500)

    user = User(
        name=name,
        email=email,
        # Derived before the row is written, not after, so the INSERT that
        # carries it is the one the unique index adjudicates. Setting it
        # post-flush would leave the UPDATE to be issued by whichever query
        # happened to autoflush next, and the IntegrityError would surface
        # somewhere with no idea what caused it.
        username=unique_username(name, email),
        role_id=role.id,
        is_active=bool(payload.get("is_active", True)),
    )
    # A placeholder, immediately replaced by _issue_credentials below.
    # users.password_hash is NOT NULL and the account has to exist before a
    # token can reference it, so there is a moment where the row needs *a*
    # hash; making it one nobody holds means that moment is not a window.
    user.set_password(generate_temp_password())
    db.session.add(user)

    # Two administrators adding the same name at the same moment both read an
    # unused username and both try to write it. The loser is caught here
    # rather than as a 500 out of some later query: the unique index is what
    # actually guarantees uniqueness, and this is the statement it guards.
    try:
        db.session.flush()  # assigns user.id before the profiles reference it
    except IntegrityError:
        db.session.rollback()
        return error("That account could not be created — please try again.", status=409)

    profile = StaffProfile(user_id=user.id)
    failure = _apply_profile(profile, payload)
    if failure:
        db.session.rollback()
        return error(failure, status=422)

    if profile.employee_code:
        clash = StaffProfile.query.filter_by(employee_code=profile.employee_code).first()
        if clash:
            db.session.rollback()
            return error("That employee code is already in use", status=409)

    db.session.add(profile)

    # The account and its operational profile are created together, or not at
    # all — a clinical role without its profile row is a security problem, not
    # just an incomplete record.
    failure = _sync_role_profile(user, role_name, profile, payload)
    if failure:
        db.session.rollback()
        return error(failure, status=422)

    audit(
        STAFF_CREATED,
        entity="user",
        entity_id=user.id,
        detail=f"Created {role_name} account for {name} ({user.username})",
    )

    # Commits, then mails. See _issue_credentials for why in that order.
    outcome = _issue_credentials(user, purpose="invite", reissued=False)
    dashboard_changed("staff_created")

    data = _serialise(user)
    data["credentials"] = outcome
    return success(
        data,
        message=_credentials_message(f"{name} added", email, outcome),
        status=201,
    )


@staff_bp.patch("/<int:user_id>")
@role_required("admin")
def update_staff(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return error("Staff member not found", status=404)

    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        name = _text(payload, "name", 150)
        if not name:
            return error("Full name cannot be empty", status=422)
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

    # No password handling here, deliberately, and `password` in the payload is
    # ignored rather than honoured. An administrator setting a password is a
    # password two people know, which is the thing this whole flow exists to
    # remove. The equivalent action is POST /staff/<id>/credentials, which
    # issues a new random one and mails it to the staff member instead.

    role_name = user.role.name if user.role else None
    if "role" in payload and payload["role"] != role_name:
        new_role_name = payload["role"]
        if new_role_name not in STAFF_ROLES:
            return error(f"role must be one of: {', '.join(STAFF_ROLES)}", status=422)
        # Moving someone out of a clinical role would strand the records their
        # old profile still owns. Left as a deliberate gap rather than a silent
        # half-migration.
        if role_name in ROLES_WITH_PROFILE and _clinical_record_count(user):
            return error(
                f"{user.name} has clinical records as a {role_name}. "
                "Disable this account and create a new one for the new role.",
                status=409,
            )
        new_role = Role.query.filter_by(name=new_role_name).first()
        if not new_role:
            return error(f"The {new_role_name} role is missing", status=500)
        user.role_id = new_role.id
        role_name = new_role_name

    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])

    profile = user.staff_profile
    if not profile:
        profile = StaffProfile(user_id=user.id)
        db.session.add(profile)

    failure = _apply_profile(profile, payload)
    if failure:
        return error(failure, status=422)

    if profile.employee_code:
        clash = StaffProfile.query.filter(
            StaffProfile.employee_code == profile.employee_code,
            StaffProfile.user_id != user.id,
        ).first()
        if clash:
            return error("That employee code is already in use", status=409)

    if role_name in ROLES_WITH_PROFILE:
        failure = _sync_role_profile(user, role_name, profile, payload)
        if failure:
            return error(failure, status=422)

    audit(STAFF_UPDATED, entity="user", entity_id=user.id, detail=f"Updated {user.name}")
    db.session.commit()
    dashboard_changed("staff_updated")

    return success(_serialise(user), message=f"{user.name} updated")


@staff_bp.post("/<int:user_id>/credentials")
@role_required("admin")
def resend_credentials(user_id):
    """Reissues a staff member's password and sign-in link, and mails them.

    The answer to every "they never got the email" and "they've locked
    themselves out" — and the reason an administrator no longer needs a way to
    type a password. Nothing is recovered here: the previous temporary
    password stops working the moment this runs, and so does any unused link,
    so a message that went to the wrong address cannot be used afterwards.

    Refused for a disabled account. Mailing working credentials to somebody
    whose access was deliberately withdrawn is the opposite of what disabling
    the account meant, and it is easily done by mistake from a staff list.
    """
    user = db.session.get(User, user_id)
    if not user:
        return error("Staff member not found", status=404)
    if not user.is_active:
        return error(
            f"{user.name}'s account is disabled. Enable it first if they should "
            "be able to sign in.",
            status=409,
        )

    # An account created before usernames existed, or by one of the older
    # routes, gets one now rather than being mailed a blank field.
    if not user.username:
        assign_username(user)

    outcome = _issue_credentials(user, purpose="invite", reissued=True)

    data = _serialise(user)
    data["credentials"] = outcome
    return success(
        data,
        message=_credentials_message(
            f"New sign-in details issued for {user.name}", user.email, outcome
        ),
    )


@staff_bp.post("/<int:user_id>/status")
@role_required("admin")
def set_status(user_id):
    """Enable or disable an account. Disabling is the reversible alternative to
    deletion, and login already refuses an inactive user."""
    user = db.session.get(User, user_id)
    if not user:
        return error("Staff member not found", status=404)

    payload = request.get_json(silent=True) or {}
    if "is_active" not in payload:
        return error("is_active is required", status=422)

    active = bool(payload["is_active"])
    if not active and int(get_jwt_identity()) == user.id:
        return error("You cannot disable your own account", status=409)
    if not active and user.role and user.role.name == "admin":
        remaining = (
            User.query.join(Role)
            .filter(Role.name == "admin", User.is_active.is_(True), User.id != user.id)
            .count()
        )
        if remaining == 0:
            return error("This is the last active administrator", status=409)

    user.is_active = active
    audit(
        STAFF_STATUS_CHANGED,
        entity="user",
        entity_id=user.id,
        detail=f"{user.name} {'enabled' if active else 'disabled'}",
    )
    db.session.commit()
    dashboard_changed("staff_status_changed")

    return success(_serialise(user), message=f"{user.name} {'enabled' if active else 'disabled'}")


@staff_bp.delete("/<int:user_id>")
@role_required("admin")
def delete_staff(user_id):
    """Permanently removes an account, but only when nothing depends on it.

    Consultations, patients and nursing records hold non-null foreign keys
    into `doctors` and `nurses`. Deleting a clinician who has treated anyone
    would either fail at the database or strip a patient's record of who
    treated them, so it is refused and disabling is offered instead.
    """
    user = db.session.get(User, user_id)
    if not user:
        return error("Staff member not found", status=404)

    if int(get_jwt_identity()) == user.id:
        return error("You cannot delete your own account", status=409)

    if user.role and user.role.name == "admin":
        remaining = User.query.join(Role).filter(Role.name == "admin", User.id != user.id).count()
        if remaining == 0:
            return error("This is the last administrator", status=409)

    records = _clinical_record_count(user)
    if records:
        summary = ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in records.items())
        return error(
            f"{user.name} has {summary} on record. Disable the account instead — "
            "deleting it would strip those records of who was responsible.",
            status=409,
        )

    name, email = user.name, user.email
    # The role profiles cascade from users.id; staff_profile does too.
    db.session.delete(user)
    audit(STAFF_DELETED, entity="user", entity_id=user_id, detail=f"Deleted {name} ({email})")
    db.session.commit()
    dashboard_changed("staff_deleted")

    return success(message=f"{name} deleted")
