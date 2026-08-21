"""Every path the frontend calls is a route the backend actually registers.

This is the check for the failure that reads as "the button does nothing".
The request goes out, the API answers 404, the screen renders with an empty
list or blanks entirely, and nothing in the build, the linter or the backend
suites has an opinion about it -- the two halves are only joined at runtime,
by a string.

It compares two facts rather than guessing at either:

  * the backend's real `app.url_map`, read out of a live application object,
    so a blueprint whose prefix changed is reflected immediately;
  * every path literal in `frontend/src/services/`, which is the whole of the
    frontend's API surface -- `api.js` and `portalApi.js` are the only axios
    instances in the tree, and nothing outside services/ calls them.

Paths are compared with their parameters flattened to `*`, so
`/cases/${caseId}/close` and `/api/cases/<int:case_id>/close` are recognised
as the same route, while `/appointments/history` stays a literal and must
exist literally -- which is correct, because Flask's `int` converter would
refuse to match "history" and the request really would 404.

Method mismatches are reported too: a POST aimed at a GET-only rule answers
405, which fails just as silently in a `.catch()`.
"""

from __future__ import annotations

import json
import re

from ._util import (
    ERROR,
    WARN,
    Finding,
    backend_python,
    line_of,
    run_cmd,
    strip_comments_js,
)

NAME = "api-contract"
TITLE = "Frontend/backend API contract"

# Dumps the registered routes from a real application object.
PROBE = r"""
import json, os
os.environ.setdefault("APP_ENV", "development")
from portal import create_app

app = create_app()
rules = []
for rule in app.url_map.iter_rules():
    rules.append({
        "rule": str(rule),
        "methods": sorted(m for m in rule.methods if m not in ("HEAD", "OPTIONS")),
    })
print("---JSON---")
print(json.dumps(rules))
"""

# `api.get("/x")`, `portalApi.post(`/y/${id}`)`, and the two bare-axios
# refresh calls written as `${API_BASE_URL}/auth/refresh`.
CALL_RE = re.compile(
    r"\b(?:api|portalApi|axios)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*"
    r"[`\"']((?:\$\{API_BASE_URL\})?/[^`\"']*)[`\"']"
)

# Paths handed to the PDF helpers instead of to axios directly -- they end up
# at `api.get(path)` inside reportService, so they are API calls too.
HELPER_RE = re.compile(
    r"\b(?:downloadPdf|openPdfForPrint)\s*\(\s*[`\"'](/[^`\"']*)[`\"']"
)


def _canonical(path: str) -> str:
    """Flatten a path's parameters so the two spellings can be compared."""
    path = path.replace("${API_BASE_URL}", "")
    path = re.sub(r"\$\{[^}]*\}", "*", path)      # frontend  ${id}
    path = re.sub(r"<[^>]*>", "*", path)          # backend   <int:id>
    path = path.split("?", 1)[0].rstrip("/")
    return path or "/"


def _backend_routes(ctx):
    code, out = run_cmd([backend_python(), "-c", PROBE], cwd=ctx.backend, timeout=600)
    if "---JSON---" not in out:
        return None, "exit %d\n%s" % (code, out[-1500:])
    # create_app() logs its bootstrap checks to stderr after the payload is
    # printed; json.dumps never wraps, so take the first line only.
    return json.loads(out.split("---JSON---", 1)[1].strip().splitlines()[0]), None


def run(ctx):
    findings = []

    rules, error = _backend_routes(ctx)
    if rules is None:
        return [
            Finding(
                ERROR,
                "Could not read the backend route table",
                where="backend/portal/routes/__init__.py",
                detail="The application failed to build, so no contract could "
                "be checked.\n" + error,
            )
        ]

    # canonical API path -> allowed methods. The /api prefix is stripped
    # because the frontend's axios baseURL already carries it.
    table = {}
    for row in rules:
        rule = row["rule"]
        if not rule.startswith("/api/"):
            continue
        key = _canonical(rule[len("/api") :])
        table.setdefault(key, set()).update(row["methods"])

    services = ctx.frontend / "src" / "services"
    if not services.is_dir():
        return [Finding(ERROR, "frontend/src/services is missing", where="frontend/src")]

    calls = 0
    for path in sorted(services.glob("*.js")):
        raw = path.read_text(encoding="utf-8", errors="replace")
        src = strip_comments_js(raw)
        rel = path.relative_to(ctx.root).as_posix()

        found = [
            (m.start(), m.group(1).upper(), m.group(2)) for m in CALL_RE.finditer(src)
        ]
        found += [(m.start(), "GET", m.group(1)) for m in HELPER_RE.finditer(src)]

        for offset, method, raw_path in found:
            calls += 1
            key = _canonical(raw_path)
            where = "%s:%d" % (rel, line_of(src, offset))

            if key not in table:
                near = sorted(k for k in table if k.split("/")[1:2] == key.split("/")[1:2])
                findings.append(
                    Finding(
                        ERROR,
                        "%s %s has no backend route -- this call 404s"
                        % (method, raw_path),
                        where=where,
                        detail="Registered under the same prefix:\n"
                        + ("\n".join("  " + n for n in near) if near else "  (none)"),
                    )
                )
                continue

            if method not in table[key]:
                findings.append(
                    Finding(
                        ERROR,
                        "%s %s is not an allowed method -- this call 405s"
                        % (method, raw_path),
                        where=where,
                        detail="The route accepts: %s" % ", ".join(sorted(table[key])),
                    )
                )

    print("    %d frontend calls against %d backend routes" % (calls, len(table)))
    return findings
