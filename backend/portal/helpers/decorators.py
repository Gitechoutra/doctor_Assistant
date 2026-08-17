"""Who may reach what.

Two roles, and one rule that separates them: **the PA runs the practice, the
doctor practises medicine.**

That splits clinical data into two questions, not one, and this module is
where the split is named rather than re-derived at each route:

  * *reading* the record -- a patient's consultations, prescriptions and
    reports. The PA needs this to run the desk: to tell a caller when their
    report is ready, to pull a previous prescription up for the doctor, to
    answer "have they been seen yet?". `clinical_read` covers it.
  * *writing* it -- a diagnosis, clinical notes, a prescription, ending a
    consultation. That is the doctor's signature on someone's care, and no
    amount of administrative convenience justifies handing it to the desk.
    `doctor_only` covers it.

Registration and the appointment book are the mirror image: `front_desk_only`
is the PA's own work, and the doctor is deliberately outside it.

One thing sits outside that split and is `doctor_only` for a different reason:
**creating accounts** (`routes/pa_routes`, `routes/doctor_routes.create_doctor`).
The doctor is the account a checkout is seeded with -- see
`seeders/seed_doctor` -- so they are the one who exists first, and a PA able to
mint accounts could mint a doctor's, which would make everything above
decorative.
"""

from functools import wraps

from flask_jwt_extended import get_jwt, verify_jwt_in_request

from portal.helpers.response import error
from portal.models.role import DOCTOR, PA

# Reading the clinical record. Both roles -- see the module docstring.
CLINICAL_READ_ROLES = (PA, DOCTOR)

# Writing it. The doctor alone.
CLINICAL_WRITE_ROLES = (DOCTOR,)

# Registration, the appointment book and the queue.
FRONT_DESK_ROLES = (PA,)


def role_required(*allowed_roles):
    """Restricts a route to users whose JWT `role` claim is in allowed_roles.

    Calls verify_jwt_in_request() itself, so it works with or without a
    jwt_required() above it.
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


def clinical_read(fn):
    """Reading a patient's clinical record. PA and doctor both."""
    return role_required(*CLINICAL_READ_ROLES)(fn)


def doctor_only(fn):
    """Recording clinical judgement. The doctor alone.

    Reads as intent at the top of a route -- "this is the doctor's signature"
    -- rather than as a role list the reader has to interpret.
    """
    return role_required(*CLINICAL_WRITE_ROLES)(fn)


def front_desk_only(fn):
    """Running the desk: registration, the appointment book, the queue."""
    return role_required(*FRONT_DESK_ROLES)(fn)


def current_role():
    """The caller's role claim. Assumes the JWT has already been verified."""
    return get_jwt().get("role")


def is_doctor():
    return current_role() == DOCTOR


def is_pa():
    return current_role() == PA
