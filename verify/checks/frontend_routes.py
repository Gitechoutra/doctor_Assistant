"""Every link in the interface lands on a route that renders something.

This is the check for the bug the workflow brief opens with: a sidebar item
that leads to a blank page. React Router does not complain about a `<NavLink
to="/dashboard/nowhere">` -- it renders the catch-all, or before there was a
catch-all, an empty document. Nothing in the build or the linter sees it,
because both halves are individually valid; only the pairing is wrong.

Three separate invariants, each of which has its own way of going wrong:

  1. Every screen AppRouter lazy-imports is a file that exists. A renamed
     page leaves an import that resolves at build time to a chunk that throws
     when the route is first visited -- a blank screen on that route only.
  2. Every in-app link resolves to a declared route. Sidebar.jsx states this
     invariant in its own header comment; this turns the comment into a gate.
  3. A catch-all route exists. Without one a mistyped URL matches nothing and
     React Router renders an empty document, which is indistinguishable from
     a crash. AppRouter's own comment says as much, so the guard is worth
     holding in place.

The reverse of (2) is deliberately not checked. Cases, Reports, Profile,
Doctors and the queue are all reachable routes that are intentionally off the
menu -- deep links from the consultation room, a notification or the account
card lead to them. Flagging a route with no nav entry would report every one
of those product decisions as a defect.
"""

from __future__ import annotations

import re

from ._util import ERROR, WARN, Finding, line_of, source_files, strip_comments_js

NAME = "frontend-routes"
TITLE = "Frontend route and navigation integrity"

LAZY_RE = re.compile(r"""import\(\s*["']([^"']+)["']\s*\)""")
PATH_ATTR_RE = re.compile(r"""\bpath\s*=\s*["']([^"']*)["']""")
INDEX_ATTR_RE = re.compile(r"\bindex\b")

# Where a link can be written.
#
# The last pattern is the one that matters most and was missing first time
# round. Sidebar.jsx does not write its entries as JSX attributes -- it holds
# them in `PA_NAV` and `DOCTOR_NAV` as object literals, `{ to: "/dashboard/x",
# label: ... }`, and a scanner looking only for `to=` walks straight past both
# navigation menus. That is the exact surface this check exists for: a nav
# entry pointing at a deleted route is the dead button in the brief. It was
# found by adding a bogus entry to the sidebar and noticing the check still
# passed.
LINK_RES = [
    re.compile(r"""\bto\s*=\s*["'](/[^"']*)["']"""),
    re.compile(r"""\bto\s*=\s*\{\s*[`"'](/[^`"']*)[`"']\s*\}"""),
    re.compile(r"""\bnavigate\s*\(\s*[`"'](/[^`"']*)[`"']"""),
    re.compile(r"""\bto\s*:\s*[`"'](/[^`"']*)[`"']"""),
]


def _canonical(path: str) -> str:
    """`/dashboard/patients/${id}` and `/dashboard/patients/:patientId` alike."""
    path = re.sub(r"\$\{[^}]*\}", "*", path)
    path = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", "*", path)
    path = path.split("?", 1)[0].split("#", 1)[0]
    path = re.sub(r"/+", "/", path).rstrip("/")
    return path or "/"


def _resolves(target: str, routes) -> bool:
    """Does `target` land on a declared route?

    Tried twice. First as written, so a literal path must exist literally.
    Then with any all-digit segment treated as a parameter, because a link
    built from data -- `/dashboard/patients/42` -- is the same route as
    `/dashboard/patients/:patientId` even though the text differs. Without
    the second pass every concrete id in the tree is reported as a dead link,
    and a check that cries wolf is one nobody reads.
    """
    canonical = _canonical(target)
    if canonical in routes:
        return True
    generalised = "/".join(
        "*" if segment.isdigit() else segment for segment in canonical.split("/")
    )
    return generalised in routes


def _tag_end(src: str, start: int) -> int:
    """Index of the `>` that closes the tag opening at `start`.

    Scanned rather than matched with `[^>]*>`, because an attribute holds a
    whole element -- `element={<DashboardLayout />}` -- and the first `>` in
    the text belongs to that, not to the Route. Reading it as the end of the
    tag makes every layout route look self-closing, and its children then lose
    the prefix they nest under: the check reports the entire application as
    unreachable and is worse than no check at all.
    """
    depth = 0
    quote = None
    i = start
    while i < len(src):
        char = src[i]
        if quote:
            if char == quote and src[i - 1] != "\\":
                quote = None
        elif char in "\"'`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        elif char == ">" and depth == 0:
            return i
        i += 1
    return -1


def _tokens(src: str):
    """(kind, position, attrs, self_closing) for every Route tag, in order."""
    out = []
    i = 0
    while True:
        opened = src.find("<Route", i)
        closed = src.find("</Route>", i)
        if opened < 0 and closed < 0:
            break
        if closed >= 0 and (opened < 0 or closed < opened):
            out.append(("close", closed, "", False))
            i = closed + len("</Route>")
            continue
        end = _tag_end(src, opened)
        if end < 0:
            break
        inner = src[opened + len("<Route") : end]
        out.append(("open", opened, inner, inner.rstrip().endswith("/")))
        i = end + 1
    return out


def _declared_routes(src: str):
    """Walk AppRouter's <Route> tree, returning (paths, has_catch_all).

    Routes nest, so a child's path only means anything with its parents' in
    front of it -- a flat scan reads `path="queue"` as `/queue` rather than
    `/dashboard/queue`.
    """
    tokens = _tokens(src)

    paths = []
    stack = []
    catch_all = False

    for kind, _pos, attrs, self_closing in tokens:
        if kind == "close":
            if stack:
                stack.pop()
            continue

        path_match = PATH_ATTR_RE.search(attrs)
        segment = path_match.group(1) if path_match else ""
        prefix = "".join(stack)

        if segment == "*":
            catch_all = True
        elif path_match or INDEX_ATTR_RE.search(attrs):
            joined = prefix if not segment else prefix + "/" + segment.lstrip("/")
            if segment.startswith("/"):
                joined = segment
            paths.append(_canonical(joined))

        if not self_closing:
            addition = ""
            if path_match and segment != "*":
                addition = segment if segment.startswith("/") else "/" + segment
            stack.append(addition.rstrip("/"))

    return set(paths), catch_all


def run(ctx):
    findings = []
    src_dir = ctx.frontend / "src"
    router = src_dir / "router" / "AppRouter.jsx"

    if not router.exists():
        return [Finding(ERROR, "AppRouter.jsx is missing", where="frontend/src/router")]

    raw = router.read_text(encoding="utf-8", errors="replace")
    clean = strip_comments_js(raw)

    # -- 1. every lazily imported screen is a file that exists ------------
    for match in LAZY_RE.finditer(clean):
        target = match.group(1)
        if not target.startswith("."):
            continue
        base = (router.parent / target).resolve()
        if not any(
            base.with_suffix(ext).exists() for ext in (".jsx", ".js", ".tsx", ".ts")
        ) and not (base / "index.jsx").exists():
            findings.append(
                Finding(
                    ERROR,
                    "AppRouter imports a screen that does not exist: %s" % target,
                    where="frontend/src/router/AppRouter.jsx:%d"
                    % line_of(clean, match.start()),
                    detail="Visiting its route renders a blank screen.",
                )
            )

    # -- 2. the route table, and the catch-all ----------------------------
    routes, catch_all = _declared_routes(clean)
    if not catch_all:
        findings.append(
            Finding(
                ERROR,
                'No catch-all <Route path="*"> is declared',
                where="frontend/src/router/AppRouter.jsx",
                detail="A mistyped or stale URL then matches nothing and React "
                "Router renders an empty document, which reads as a crash.",
            )
        )

    # -- 3. every in-app link resolves ------------------------------------
    checked = 0
    for path in source_files(src_dir, {".jsx", ".js"}):
        text = strip_comments_js(path.read_text(encoding="utf-8", errors="replace"))
        rel = path.relative_to(ctx.root).as_posix()
        for pattern in LINK_RES:
            for match in pattern.finditer(text):
                target = match.group(1)
                # External links and asset paths are not router targets. The
                # API's own paths are served by Flask, not by the router.
                if target.startswith(("//", "/api/", "/static/")):
                    continue
                checked += 1
                if not _resolves(target, routes):
                    findings.append(
                        Finding(
                            ERROR,
                            "Link to '%s' matches no route -- it lands on NotFound"
                            % target,
                            where="%s:%d" % (rel, line_of(text, match.start())),
                            detail="Nearest declared routes:\n"
                            + "\n".join(
                                "  " + r
                                for r in sorted(routes)
                                if r.split("/")[1:2] == _canonical(target).split("/")[1:2]
                            ),
                        )
                    )

    print(
        "    %d routes declared, %d links checked, catch-all %s"
        % (len(routes), checked, "present" if catch_all else "MISSING")
    )
    return findings
