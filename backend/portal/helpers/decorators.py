from functools import wraps

from flask_jwt_extended import get_jwt, verify_jwt_in_request

from portal.helpers.response import error

# Who may touch patient care: diagnoses, prescriptions, consultations,
# reports, and the whole nursing record.
#
# Reception is deliberately absent. The front desk registers patients, keeps
# their details current, routes them to a doctor and manages the appointment
# book -- it has no business reading what was diagnosed or prescribed. Kept as
# one named tuple rather than repeated role lists so widening clinical access
# is a single, visible edit.
CLINICAL_ROLES = ("admin", "doctor", "nurse")

# Registration and the appointment book.
FRONT_DESK_ROLES = ("admin", "receptionist")


def role_required(*allowed_roles):
    """Restricts a route to users whose JWT `role` claim is in allowed_roles.

    Must be stacked under a route that also needs jwt_required(); this
    decorator calls verify_jwt_in_request() itself so it can be used alone.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") not in allowed_roles:
                return error("Forbidden: insufficient role", status=403)
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def clinical_only(fn):
    """Shorthand for `role_required(*CLINICAL_ROLES)`.

    Reads as intent at the top of a route -- "this is patient care" -- rather
    than as a list of roles the reader has to interpret.
    """
    return role_required(*CLINICAL_ROLES)(fn)


def current_role():
    """The caller's role claim. Assumes the JWT has already been verified."""
    return get_jwt().get("role")
