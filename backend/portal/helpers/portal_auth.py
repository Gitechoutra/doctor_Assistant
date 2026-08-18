"""Who the patient portal lets in, and — just as important — where their token
stops.

The practice's own two roles are defined in `models/role` and separated by
`helpers/decorators`. A patient is not a third one of those. They are a
different *kind* of caller altogether, and this module is the boundary
between the two.

Why the separation is structural rather than another role name
--------------------------------------------------------------

Every staff route is `@jwt_required()` and answers "whose list is this?" with
`helpers/auth_helper.get_current_doctor()`, which returns the caller's Doctor
row — or **None**, meaning "the desk", who sees the practice's whole book. That
is correct for the two roles it was written for and quietly catastrophic for a
third: a patient added to `users` would have no Doctor profile, so
`get_current_doctor()` would return None and every route that scopes by it
would have shown that patient the entire practice. Not through a bug — through
working exactly as designed, for a caller it was never designed for.

So the portal is a second identity space:

  * **credentials** live on `patients`, not `users` (see `models/patient`);
  * **identity** in the token is `"patient:<id>"`, which is not an integer and
    so matches no `users.id` any staff route could look up;
  * **claims** carry `scope: "portal"`, which is what the boundary below reads.

Three independent things, any one of which would have to be defeated on its
own. That is the point: the failure being guarded against is not a clever
attacker, it is a route added next year by someone who never read this file.

The boundary
------------

`register_portal_boundary` refuses a portal token at any path outside
`/api/portal/*`, before the route sees it. Registered once in the app factory,
so it covers every blueprint — including ones that do not exist yet, which is
the only way a guard like this stays true. It is fail-closed: a token that
says `portal` gets nothing but the portal, whatever decorator the route it
aimed at happens to carry.

`@patient_only` is the other half, and it is not the same check inverted — it
also loads the patient, confirms the account is still enabled, and hands the
route a `Patient` it can trust. A staff token reaching a portal route fails it
for want of the scope claim.
"""

from functools import wraps

from flask import g, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    verify_jwt_in_request,
)

from portal.helpers.response import error
from portal.models.patient import Patient

# The claim that marks a token as the patient portal's, and the only thing
# the boundary reads. A staff token has no `scope` claim at all.
PORTAL_SCOPE = "portal"

# The `role` claim a portal token carries. Deliberately not added to
# `models/role.ROLE_NAMES`: nothing in `helpers/decorators` should ever be
# able to name it, because no staff route should ever accept it. It exists so
# an audit line records *what kind* of caller acted, not to grant anything.
PORTAL_ROLE = "patient"

# Everything under this prefix is the portal's, and nothing above it is.
PORTAL_PREFIX = "/api/portal"


def portal_identity(patient):
    """The JWT subject for a patient.

    Prefixed, and therefore never parseable as a `users.id`. `int()` on it
    raises, which is what makes `helpers/audit.audit` record a portal action
    with a null actor rather than attributing it to whichever staff member
    happens to hold that number.
    """
    return f"patient:{patient.id}"


def patient_id_from_identity(identity):
    """The patient id inside a portal identity, or None if it is not one."""
    if not isinstance(identity, str) or not identity.startswith("patient:"):
        return None
    try:
        return int(identity.split(":", 1)[1])
    except (IndexError, ValueError):
        return None


def issue_portal_tokens(patient):
    """The access/refresh pair a signed-in patient carries."""
    identity = portal_identity(patient)
    claims = {"role": PORTAL_ROLE, "scope": PORTAL_SCOPE, "patient_id": patient.id}
    return {
        "access_token": create_access_token(identity=identity, additional_claims=claims),
        "refresh_token": create_refresh_token(identity=identity, additional_claims=claims),
    }


def _claims_or_none():
    """The verified claims on this request, or None if there is no usable
    token.

    Never raises. A missing, malformed or expired token is "not a portal
    token" as far as the boundary is concerned — and the route's own
    `@jwt_required()` will still refuse it with a proper 401, which is a
    better answer than a 403 from here about a token nobody could read.
    """
    try:
        verify_jwt_in_request(optional=True)
        return get_jwt() or None
    except Exception:  # noqa: BLE001 - an unreadable token is not a portal token
        return None


def is_portal_request():
    """Whether the path being served belongs to the portal."""
    return (request.path or "").startswith(PORTAL_PREFIX)


def register_portal_boundary(app):
    """Refuses portal tokens outside `/api/portal/*`.

    One `before_request` on the whole app rather than a decorator per route,
    because the routes this has to hold for are the ones not yet written. A
    guard you have to remember to apply is a guard that is one merge away from
    being wrong.
    """

    @app.before_request
    def _keep_patients_inside_the_portal():
        if is_portal_request():
            return None
        claims = _claims_or_none()
        if claims and claims.get("scope") == PORTAL_SCOPE:
            app.logger.warning(
                "Portal token refused outside the portal: %s %s",
                request.method,
                request.path,
            )
            return error(
                "This sign-in is for the patient portal and cannot be used here.",
                status=403,
            )
        return None

    return app


def current_portal_patient():
    """The Patient this request is authenticated as, or None.

    Reads `g` where `@patient_only` has already put it, so a route and its
    helpers resolve the same row without a second query.
    """
    return getattr(g, "portal_patient", None)


def patient_only(fn):
    """Restricts a route to a signed-in patient, and loads them.

    Everything that could make the token stale is checked on every request
    rather than trusted from when it was issued: the patient may have been
    deleted, or the desk may have revoked their access since. A token cannot
    be un-issued, so the account is what decides.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get("scope") != PORTAL_SCOPE:
            # A staff token. Refused rather than accommodated: the desk and the
            # doctor have their own screens for this, and letting a staff token
            # act "as" a patient here would put actions in the record with no
            # honest answer to who took them.
            return error("Sign in to the patient portal to use this.", status=403)

        patient_id = claims.get("patient_id") or patient_id_from_identity(
            claims.get("sub")
        )
        patient = Patient.query.get(patient_id) if patient_id else None
        if not patient:
            return error("This account no longer exists", status=401)
        if not patient.has_portal_access:
            return error(
                "Portal access for this account has been turned off. "
                "Please contact the practice.",
                status=403,
            )

        g.portal_patient = patient
        return fn(*args, **kwargs)

    return wrapper
