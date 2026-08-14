

 
import os
 
from portal.extensions import db
from portal.models.role import Role
from portal.models.user import User
 
DEFAULT_NAME = "Admin"
DEFAULT_EMAIL = "ramanamuddada@gmail.com"
DEFAULT_PASSWORD = "Ramana@123"
 
# Spellings of "no" accepted from the environment. Anything else — including
# an unset or empty value — leaves syncing on, so the documented default
# behavior does not depend on remembering to set anything.
_FALSEY = {"0", "false", "no", "off"}
 
 
def admin_credentials():
    """The configured administrator details.
 
    Returns (name, email, password, is_default_password). The last one is what
    lets a caller warn about shipping the documented password.
    """
    name = (os.environ.get("SEED_ADMIN_NAME") or "").strip() or DEFAULT_NAME
    email = ((os.environ.get("SEED_ADMIN_EMAIL") or "").strip() or DEFAULT_EMAIL).lower()
    password = os.environ.get("SEED_ADMIN_PASSWORD") or DEFAULT_PASSWORD
    return name, email, password, password == DEFAULT_PASSWORD
 
 
def sync_enabled():
    """Whether an existing administrator is rewritten to match the config."""
    return (os.environ.get("SEED_ADMIN_SYNC") or "").strip().lower() not in _FALSEY
 
 
def _apply_configured_credentials(admin, name, email, password):
    """Rewrites `admin` to match the configuration. Returns what changed.
 
    The returned list names the fields actually written — empty when the
    account already agreed with the configuration, which is the common case on
    a restart and the reason this does not commit unconditionally.
    """
    if not sync_enabled():
        return []
 
    # `users.email` is unique, so a clash is reported before anything is
    # written rather than left to surface as an IntegrityError on commit.
    if admin.email != email:
        clash = User.query.filter(User.email == email, User.id != admin.id).first()
        if clash:
            raise RuntimeError(
                f"Cannot move the administrator to {email}: that address already "
                f"belongs to a {clash.role.name if clash.role else 'non-admin'} "
                "account. Set SEED_ADMIN_EMAIL to a different address."
            )
 
    changes = []
 
    if admin.name != name:
        admin.name = name
        changes.append("name")
 
    if admin.email != email:
        admin.email = email
        changes.append("email")
 
    # Asked of the stored hash rather than replaced outright: the hash is
    # salted, so rewriting it every boot would churn `updated_at` and report a
    # password change on every restart even when nothing moved.
    if not admin.check_password(password):
        admin.set_password(password)
        changes.append("password")
 
    if changes:
        db.session.commit()
 
    return changes
 
 
def ensure_admin_account():
    """Creates the default administrator, or brings the existing one in step
    with the configured credentials.
 
    Returns (user, created, changes). `changes` names the fields rewritten on
    an account that already existed, and is empty both when nothing moved and
    whenever `created` is True.
 
    The account is found by "is there an admin", not "does this email exist".
    Those differ the moment the configured address changes, and matching on
    email got that case badly wrong: it read a renamed admin as an absent one
    and created a *second* account beside theirs, holding the default password
    from the repository. Finding the admin by role is what makes a changed
    email an update to one row instead of two rows to choose between.
 
    `is_active` is never written. A disabled admin is one somebody deliberately
    switched off, and neither creating a replacement beside it nor quietly
    re-enabling it may follow from restarting the server — that would turn "can
    restart the server" into "can regain admin".
 
    Raises RuntimeError if the `admin` role is missing, which is a caller
    ordering mistake: roles have to be seeded first. Also raises if the
    configured email belongs to somebody else, in either direction — creating
    the account or moving it.
    """
    name, email, password, _is_default = admin_credentials()
 
    admin_role = Role.query.filter_by(name="admin").first()
    if not admin_role:
        # Say so plainly rather than failing on a NoneType attribute below.
        raise RuntimeError(
            "The 'admin' role does not exist. Run the roles seeder before this one."
        )
 
    # Oldest first, so the account reported back is stable across restarts
    # rather than whichever row the database happened to return.
    existing = (
        User.query.filter_by(role_id=admin_role.id).order_by(User.id).first()
    )
    if existing:
        return existing, False, _apply_configured_credentials(
            existing, name, email, password
        )
 
    # No administrator anywhere — but the configured email could still be in
    # use by some other role, and `users.email` is unique. Report that rather
    # than letting it surface as an IntegrityError at boot.
    clash = User.query.filter_by(email=email).first()
    if clash:
        raise RuntimeError(
            f"Cannot create the default administrator: {email} is already used by "
            f"a {clash.role.name if clash.role else 'non-admin'} account. "
            "Set SEED_ADMIN_EMAIL to a different address."
        )
 
    admin = User(name=name, email=email, role_id=admin_role.id)
    admin.set_password(password)
    db.session.add(admin)
    db.session.commit()
    return admin, True, []
 
 
def run():
    """The `python -m portal.seeds` entry point. Reports to stdout."""
    _name, _email, _password, is_default_password = admin_credentials()
 
    admin, created, changes = ensure_admin_account()
 
    if created:
        print(f"  Admin       -> created {admin.email}")
        if is_default_password:
            print(
                "                 WARNING: using the default password. "
                "Set SEED_ADMIN_PASSWORD, or change it after first sign-in."
            )
        return admin
 
    if changes:
        print(f"  Admin       -> updated {admin.email} ({', '.join(changes)})")
        if is_default_password and "password" in changes:
            print(
                "                 WARNING: that is the default password from the "
                "repository. Set SEED_ADMIN_PASSWORD."
            )
    else:
        print(f"  Admin       -> an administrator already exists ({admin.email}), left untouched")
 
    if not admin.is_active:
        print(
            "                 NOTE: that account is disabled. Re-enable it in the "
            "database if you are locked out."
        )
    return admin
 
 