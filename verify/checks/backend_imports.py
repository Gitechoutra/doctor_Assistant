"""Every backend module compiles and imports.

`npm run build` catches a broken frontend module; nothing caught a broken
backend one until the server was started and the route was hit. A typo in a
helper that only one branch imports could sit unnoticed until a user found
it, which is exactly the class of failure that reads as "the API just 500s".

Two passes, because they fail differently:

  * compile()  -- a syntax error, found without running a line of the module.
  * import     -- a name that does not exist, a circular import, a module that
                  raises at import time. Found only by actually importing.
"""

from __future__ import annotations

import json

from ._util import ERROR, Finding, backend_python, run_cmd, source_files

NAME = "backend-imports"
TITLE = "Backend syntax and import sweep"

# Imported for a side effect rather than a route, and expensive or
# environment-dependent to import: skipped in the import pass, still compiled
# in the syntax pass. `ffmpeg_setup` shells out to ffmpeg on import.
IMPORT_SKIP = {"portal.ai.ffmpeg_setup"}

# Runs inside the backend interpreter. Reports per module as JSON so one
# module that dies noisily still leaves a record of which one it was.
PROBE = r"""
import importlib, json, sys, traceback
results = []
for mod in sys.argv[1:]:
    try:
        importlib.import_module(mod)
        results.append({"module": mod, "ok": True})
    except BaseException as exc:
        results.append({
            "module": mod,
            "ok": False,
            "error": "%s: %s" % (type(exc).__name__, exc),
            "trace": traceback.format_exc()[-800:],
        })
print("---JSON---")
print(json.dumps(results))
"""


def _module_name(path, backend):
    rel = path.relative_to(backend).with_suffix("")
    parts = list(rel.parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def run(ctx):
    findings = []
    files = [p for p in source_files(ctx.backend, {".py"}) if "tests" not in p.parts]

    # ----------------------------------------------------------- syntax --
    modules = []
    for path in files:
        src = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(ctx.root).as_posix()
        try:
            compile(src, str(path), "exec")
        except SyntaxError as exc:
            findings.append(
                Finding(
                    ERROR,
                    "Syntax error in " + rel,
                    where=rel + ":" + str(exc.lineno),
                    detail=str(exc.msg) + "\n" + (exc.text or "").strip(),
                )
            )
            continue
        name = _module_name(path, ctx.backend)
        if name and name not in IMPORT_SKIP:
            modules.append(name)

    if findings:
        # A syntax error makes the import pass nothing but noise.
        return findings

    # ----------------------------------------------------------- import --
    code, out = run_cmd(
        [backend_python(), "-c", PROBE] + modules, cwd=ctx.backend, timeout=600
    )
    if "---JSON---" not in out:
        findings.append(
            Finding(
                ERROR,
                "The import sweep could not run",
                where="backend/",
                detail="exit " + str(code) + "\n" + out[-1200:],
            )
        )
        return findings

    # The application logs to stderr as it starts and that output can follow
    # the payload; json.dumps never wraps, so the first line is the whole of it.
    payload = json.loads(out.split("---JSON---", 1)[1].strip().splitlines()[0])
    for row in payload:
        if row["ok"]:
            continue
        findings.append(
            Finding(
                ERROR,
                row["module"] + " fails to import",
                where=row["module"].replace(".", "/") + ".py",
                detail=row["error"] + "\n" + row.get("trace", ""),
            )
        )

    print("    swept %d files, imported %d modules" % (len(files), len(modules)))
    return findings
