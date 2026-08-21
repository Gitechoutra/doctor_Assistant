"""What the code imports, what the manifests declare, and what is installed.

The three sets should agree. Where they do not, the direction of the
disagreement decides how much it matters, so this check reports three
different things rather than one:

  * **Imported but not declared** -- an error. The package is present today
    only because something else happens to pull it in, and the day that
    something else changes its own dependencies the import raises at startup.
    `simple-websocket` was exactly this: absent from a fresh checkout, the
    websocket handshake answered 500, the browser fell back to polling and
    the queue's live refresh degraded without a word. The comment above that
    line in requirements.txt is the scar it left.
  * **Declared, absent, and imported somewhere** -- an error. Whatever imports
    it is broken on this machine right now.
  * **Declared, absent, and imported nowhere** -- a warning. Nothing is
    broken; the declaration has outlived the code that needed it, and a fresh
    `pip install -r requirements.txt` pays for it anyway. Worth a human's
    attention, not worth failing a build over, and never worth this script
    deciding on its own to delete.

Plus the lockfile, which has one job: `npm ci` in CI must install what the
developer actually ran.
"""

from __future__ import annotations

import ast
import json

from ._util import ERROR, WARN, Finding, backend_python, run_cmd, source_files

NAME = "deps"
TITLE = "Dependency validation"

# Distributions whose import name cannot be derived from the project name.
# Everything else is matched by normalising '-' to '_' and lowercasing.
IMPORT_ALIASES = {
    "flask-sqlalchemy": ["flask_sqlalchemy"],
    "flask-migrate": ["flask_migrate"],
    "flask-jwt-extended": ["flask_jwt_extended"],
    "flask-cors": ["flask_cors"],
    "flask-socketio": ["flask_socketio"],
    "python-socketio": ["socketio"],
    "python-dotenv": ["dotenv"],
    "pymysql": ["pymysql"],
    "google-genai": ["google"],
    "openai-whisper": ["whisper"],
    "imageio-ffmpeg": ["imageio_ffmpeg"],
    "simple-websocket": ["simple_websocket"],
}

# Imported directly, and guaranteed by a declared parent: Flask cannot install
# without Werkzeug, Flask-SQLAlchemy cannot without SQLAlchemy. Reported as a
# warning rather than an error -- naming them explicitly is defensible, and so
# is leaving them to their parents.
GUARANTEED_BY_PARENT = {"werkzeug": "Flask", "sqlalchemy": "Flask-SQLAlchemy"}

LOCAL_PACKAGES = {"portal", "config", "tests", "checks"}

PROBE = r"""
import json, sys
from importlib.metadata import distribution, PackageNotFoundError, packages_distributions

declared = json.loads(sys.argv[1])
installed = {}
for name in declared:
    try:
        distribution(name)
        installed[name] = True
    except PackageNotFoundError:
        installed[name] = False

# top-level module name -> the distributions that provide it
provides = {}
try:
    for module, dists in packages_distributions().items():
        provides[module] = sorted(dists)
except Exception:
    pass

print("---JSON---")
print(json.dumps({"installed": installed, "provides": provides}))
"""


def _requirements(path):
    """Distribution names from requirements.txt, comments and pins removed."""
    names = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        for sep in ("==", ">=", "<=", "~=", ">", "<", "[", ";"):
            line = line.split(sep, 1)[0]
        line = line.strip()
        if line:
            names.append(line)
    return names


def _imports(ctx):
    """Top-level module names imported anywhere in the backend."""
    found = set()
    for path in source_files(ctx.backend, {".py"}):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue  # the import sweep reports this properly
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    found.add(alias.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                found.add(node.module.split(".")[0])
    return found


def _candidates(dist_name):
    key = dist_name.lower()
    return IMPORT_ALIASES.get(key, [key.replace("-", "_")])


def _python(ctx, findings):
    req = ctx.backend / "requirements.txt"
    if not req.exists():
        findings.append(Finding(ERROR, "backend/requirements.txt is missing"))
        return

    declared = _requirements(req)
    imported = _imports(ctx)

    code, out = run_cmd(
        [backend_python(), "-c", PROBE, json.dumps(declared)], cwd=ctx.backend
    )
    if "---JSON---" not in out:
        findings.append(
            Finding(WARN, "Could not read the installed Python packages",
                    detail=out[-400:])
        )
        return

    # The probe's own logging can follow the payload; json.dumps never wraps.
    payload = json.loads(out.split("---JSON---", 1)[1].strip().splitlines()[0])
    installed = payload["installed"]
    provides = payload["provides"]

    stdlib = _stdlib_names(ctx)

    # -- declared but absent ---------------------------------------------
    for name in declared:
        if installed.get(name):
            continue
        used = [c for c in _candidates(name) if c in imported]
        if used:
            findings.append(
                Finding(
                    ERROR,
                    "'%s' is declared and imported but not installed" % name,
                    where="backend/requirements.txt",
                    detail="imported as %s -- that import fails on this machine.\n"
                    "pip install -r requirements.txt" % ", ".join(used),
                )
            )
        else:
            findings.append(
                Finding(
                    WARN,
                    "'%s' is declared but neither installed nor imported" % name,
                    where="backend/requirements.txt",
                    detail="No module it provides is imported anywhere in "
                    "backend/. Nothing is broken, but a fresh "
                    "`pip install -r requirements.txt` still downloads it. "
                    "Removing it is a judgement call for a human -- this "
                    "check will not make it.",
                )
            )

    # -- imported but not declared ---------------------------------------
    declared_lower = {d.lower() for d in declared}
    for module in sorted(imported):
        if module in stdlib or module in LOCAL_PACKAGES:
            continue
        dists = provides.get(module, [])
        if any(d.lower() in declared_lower for d in dists):
            continue
        # Also accept a declared name that simply maps to this module.
        if any(module in _candidates(d) for d in declared):
            continue
        if not dists:
            continue  # not installed and not declared -- the sweep will say so

        if module in GUARANTEED_BY_PARENT:
            findings.append(
                Finding(
                    WARN,
                    "'%s' is imported directly but not declared" % module,
                    where="backend/requirements.txt",
                    detail="It arrives with %s, which is declared, so it is "
                    "always present in practice. Declaring it anyway would "
                    "make the reliance explicit."
                    % GUARANTEED_BY_PARENT[module],
                )
            )
        else:
            findings.append(
                Finding(
                    ERROR,
                    "'%s' is imported but not declared in requirements.txt" % module,
                    where="backend/requirements.txt",
                    detail="Installed today only as a dependency of %s. If that "
                    "package drops it, the import fails at startup -- which is "
                    "how simple-websocket went missing from a fresh checkout."
                    % ", ".join(dists),
                )
            )

    print("    %d declared, %d imported, %d installed"
          % (len(declared), len(imported), sum(1 for v in installed.values() if v)))


def _stdlib_names(ctx):
    code, out = run_cmd(
        [backend_python(), "-c",
         "import sys, json; print(json.dumps(sorted(sys.stdlib_module_names)))"],
        cwd=ctx.backend,
    )
    try:
        return set(json.loads(out.strip().splitlines()[-1]))
    except Exception:
        return set()


def _node(ctx, findings):
    pkg = ctx.frontend / "package.json"
    lock = ctx.frontend / "package-lock.json"

    if not lock.exists():
        findings.append(
            Finding(ERROR, "frontend/package-lock.json is missing",
                    detail="CI installs with `npm ci`, which requires it.")
        )
        return
    if not pkg.exists():
        findings.append(Finding(ERROR, "frontend/package.json is missing"))
        return

    declared = json.loads(pkg.read_text(encoding="utf-8"))
    wanted = dict(declared.get("dependencies", {}))
    wanted.update(declared.get("devDependencies", {}))

    root = json.loads(lock.read_text(encoding="utf-8")).get("packages", {}).get("", {})
    in_lock = dict(root.get("dependencies", {}))
    in_lock.update(root.get("devDependencies", {}))

    for name, wanted_range in wanted.items():
        if in_lock.get(name) != wanted_range:
            findings.append(
                Finding(
                    ERROR,
                    "package-lock.json has drifted for '%s'" % name,
                    where="frontend/package-lock.json",
                    detail="package.json wants %s, the lockfile records %s "
                    "-- run `npm install`."
                    % (wanted_range, in_lock.get(name, "(absent)")),
                )
            )

    not_installed = [
        n for n in wanted if not (ctx.frontend / "node_modules" / n).exists()
    ]
    for name in not_installed:
        findings.append(
            Finding(
                ERROR,
                "Declared node dependency '%s' is not installed" % name,
                where="frontend/package.json",
                detail="run `npm install` in frontend/",
            )
        )

    print("    %d node dependencies, %d not installed"
          % (len(wanted), len(not_installed)))


def run(ctx):
    findings = []
    _python(ctx, findings)
    _node(ctx, findings)
    return findings
