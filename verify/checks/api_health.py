"""The running API is this application, and its boundaries hold.

Every check here is against a live server, and the first one is the one that
matters most on this machine: **is the thing answering actually our API?**

Another application on this developer's machine also binds port 5000, and
Windows lets both bind without either failing. Whichever bound last answers,
so `/api/patients` can return a perfectly well-formed 404 from a completely
different program. Downstream that is indistinguishable from a broken
frontend -- lists come back empty, panels that dereference the missing data
blank out -- and it has already cost this project a bug hunt through React
code that was never wrong. So identity is asserted before anything else, and
a mismatch is reported as a misconfigured environment rather than as a defect
in the application.

After identity: the error envelope, the auth boundary and the role boundary.
Those are contracts the frontend is written against -- `services/api.js`
refreshes on a 401 and signs out on a second one -- so a route that answers
403 or 500 where it used to answer 401 breaks the client without breaking any
test that only looks at the happy path.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request

from ._util import ERROR, WARN, Finding

NAME = "api-health"
TITLE = "Live API health and boundaries"


def _request(url, method="GET", body=None, headers=None, timeout=20):
    """Returns (status, parsed_json_or_None, raw_text)."""
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        status = exc.code
    except Exception as exc:
        return 0, None, str(exc)
    try:
        return status, json.loads(raw), raw
    except json.JSONDecodeError:
        return status, None, raw


def _listeners_on(port):
    """How many sockets are listening on `port`, best effort.

    Only informative: if binding fails the port is in use, which is expected
    here -- our own server is on it. The value is in noticing *two*.
    """
    count = 0
    for family, addr in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET, "0.0.0.0")):
        sock = socket.socket(family)
        try:
            sock.bind((addr, port))
        except OSError:
            count += 1
        finally:
            sock.close()
    return count


def run(ctx):
    if not ctx.live or not ctx.api_base:
        return [Finding(WARN, "No live API to check", detail="Run without --quick.")]

    findings = []
    base = ctx.api_base.rstrip("/")
    checks = 0

    # -- 1. identity: is this our API? ------------------------------------
    checks += 1
    status, payload, raw = _request(base + "/health")
    if status != 200 or not isinstance(payload, dict) or payload.get("status") != "ok":
        findings.append(
            Finding(
                ERROR,
                "The API's health endpoint did not answer as this application",
                where=base + "/health",
                detail="Expected 200 with {\"status\": \"ok\", \"environment\": ...}.\n"
                "Got %s: %s\n\nIf another program holds this port, that is the "
                "cause -- see verify/README.md." % (status, raw[:300]),
            )
        )
        return findings  # nothing below means anything against the wrong server

    # A second corroborating route, because "status: ok" is a common enough
    # shape that another service could produce it by coincidence. A 404 here
    # with a healthy /health is the signature of the port collision.
    checks += 1
    status, _payload, raw = _request(base + "/auth/login", method="POST", body={})
    if status == 404:
        findings.append(
            Finding(
                ERROR,
                "POST /auth/login 404s while /health answers -- this is not our API",
                where=base,
                detail="Another application is almost certainly holding this "
                "port. On Windows two processes can both bind it and the last "
                "one wins.\nResponse: " + raw[:300],
            )
        )
        return findings
    if status not in (400, 401, 422):
        findings.append(
            Finding(
                WARN,
                "POST /auth/login with an empty body answered %d" % status,
                where=base + "/auth/login",
                detail="Expected a validation refusal (400/401/422).\n" + raw[:300],
            )
        )

    # -- 2. the JSON error envelope ---------------------------------------
    # The frontend reads `message` off every failure. An HTML error page here
    # means axios hands the UI an unparseable body and the catch branch shows
    # nothing useful.
    checks += 1
    status, payload, raw = _request(base + "/definitely-not-a-route")
    if status != 404:
        findings.append(
            Finding(
                ERROR,
                "An unknown API path answered %d rather than 404" % status,
                where=base + "/definitely-not-a-route",
                detail=raw[:300],
            )
        )
    elif not isinstance(payload, dict) or "message" not in payload:
        findings.append(
            Finding(
                ERROR,
                "A 404 from the API is not the JSON envelope the frontend reads",
                where=base + "/definitely-not-a-route",
                detail="Expected {\"success\": false, \"message\": ...}.\nGot: "
                + raw[:300],
            )
        )

    # -- 3. the authentication boundary -----------------------------------
    # Unauthenticated must be 401, not 403 and not 500: api.js refreshes the
    # token on 401 and signs the user out if that fails. Any other status and
    # a doctor mid-consultation is dropped at the login screen instead.
    for path in ("/patients", "/appointments/queue", "/consultations",
                 "/dashboard/summary", "/pas", "/reports"):
        checks += 1
        status, _payload, raw = _request(base + path)
        if status != 401:
            findings.append(
                Finding(
                    ERROR,
                    "GET %s without a token answered %d, expected 401" % (path, status),
                    where=base + path,
                    detail="services/api.js treats 401 as 'refresh and retry'. "
                    "Any other status skips that path.\n" + raw[:200],
                )
            )

    # -- 4. the portal boundary -------------------------------------------
    # A patient's token is refused anywhere outside /api/portal, enforced by
    # helpers/portal_auth.register_portal_boundary. Unauthenticated, these
    # answer 401 the same way; what is checked here is that the routes exist
    # and are guarded rather than open.
    for path in ("/portal/me", "/portal/appointments"):
        checks += 1
        status, _payload, raw = _request(base + path)
        if status != 401:
            findings.append(
                Finding(
                    ERROR,
                    "GET %s without a token answered %d, expected 401" % (path, status),
                    where=base + path,
                    detail=raw[:200],
                )
            )

    # -- 5. a bad token is refused, not accepted --------------------------
    # The boundary question is only whether it is refused, and 422 refuses it
    # just as firmly as 401 does. The difference matters to the client rather
    # than to security, so it is reported as a warning: `services/api.js`
    # branches on 401 alone, and a status it does not recognise skips both the
    # refresh and the sign-out.
    checks += 1
    status, _payload, raw = _request(
        base + "/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    if status == 422:
        findings.append(
            Finding(
                WARN,
                "A malformed bearer token answers 422, and the frontend only "
                "handles 401",
                where=base + "/auth/me",
                detail="Flask-JWT-Extended's default `invalid_token_loader` "
                "returns 422; no loader is registered to change it. The token "
                "is refused either way, so nothing leaks -- but services/api.js "
                "refreshes on 401 and signs out on 401, and does neither here. "
                "A session holding a corrupted or stale-format access token is "
                "then neither renewed nor signed out: every screen errors and "
                "the user is never sent back to the login page.\n"
                "Fixing it is one `@jwt.invalid_token_loader` returning 401 in "
                "portal/__init__.py -- left alone here because authentication "
                "is signed-off code, so the call belongs to a human.\n"
                "Response: " + raw[:160],
            )
        )
    elif status != 401:
        findings.append(
            Finding(
                ERROR,
                "A malformed bearer token answered %d -- it was not refused" % status,
                where=base + "/auth/me",
                detail=raw[:200],
            )
        )

    # -- 6. the port is not shared ----------------------------------------
    port = urllib.parse.urlparse(base).port
    if port and _listeners_on(port) > 1:
        findings.append(
            Finding(
                WARN,
                "Port %d appears to be held on more than one address" % port,
                detail="Two processes bound to the same port answer "
                "unpredictably. See verify/README.md.",
            )
        )

    print("    %d live checks against %s" % (checks, base))
    return findings
