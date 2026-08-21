"""The whole verification workflow, in one command.

    python verify/run.py                 everything
    python verify/run.py --quick         everything that needs no server
    python verify/run.py --no-e2e        everything but the browser pass
    python verify/run.py --json out.json a machine-readable report as well

Stages run in the order a failure is cheapest to understand: the things that
need nothing running come first, so a syntax error is reported in seconds
rather than after a browser has been started and a database rebuilt.

Exit code is 0 only if every stage passed. A stage that reports WARN findings
and no ERROR ones still passes -- warnings are for a human to read, not for
CI to block on -- and `--strict` promotes them if a deployment would rather
they did block.

Servers: the live stages need the API and the built frontend running. This
script starts both on ports it has confirmed are free, and stops them again
on the way out, so a run leaves nothing behind. It never uses port 5000 by
default: another application on this machine binds it too (see
verify/README.md), and Windows lets both bind without either one failing --
whichever bound last answers, and the resulting 404s look exactly like a
broken frontend.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
E2E_DIST = HERE / ".e2e-dist"
LOG_DIR = HERE / ".logs"
sys.path.insert(0, str(HERE))

# A Windows console defaults to cp1252, and findings quote whatever the
# application put on screen -- an en dash in a page title, a replacement
# character out of a decoded log. Printing one killed the whole run at the
# report, after every check had already passed.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from checks._util import (  # noqa: E402
    ERROR,
    WARN,
    Ctx,
    Finding,
    backend_python,
    run_cmd,
)
from checks import api_contract, backend_imports, clock_rule, deps  # noqa: E402
from checks import api_health, frontend_routes  # noqa: E402

STATIC_CHECKS = [deps, backend_imports, api_contract, frontend_routes, clock_rule]

BOLD, DIM, RED, YELLOW, GREEN, RESET = (
    "\033[1m", "\033[2m", "\033[31m", "\033[33m", "\033[32m", "\033[0m",
)
if os.name == "nt" and not os.environ.get("WT_SESSION"):
    # Old consoles print the escapes literally, which is worse than no colour.
    try:
        import colorama  # noqa: F401
    except ImportError:
        BOLD = DIM = RED = YELLOW = GREEN = RESET = ""


class Stage:
    """One reportable unit of the workflow."""

    def __init__(self, name, title):
        self.name = name
        self.title = title
        self.findings = []
        self.status = "pending"   # passed | failed | skipped
        self.note = ""
        self.seconds = 0.0

    @property
    def errors(self):
        return [f for f in self.findings if f.severity == ERROR]

    @property
    def warnings(self):
        return [f for f in self.findings if f.severity == WARN]


def _bindable(addr, port):
    """The port actually bound on `addr`, or None. Released immediately."""
    sock = socket.socket()
    try:
        sock.bind((addr, port))
        return sock.getsockname()[1]
    except OSError:
        return None
    finally:
        sock.close()


def free_port(preferred):
    """`preferred` if genuinely nobody holds it, otherwise one the OS picks.

    Both `0.0.0.0` and `127.0.0.1` are tried, one after the other, and a port
    only counts as free if both succeed. Checking a single address is not
    enough on Windows: a process holding the wildcard address does not stop a
    second one from binding loopback, so a loopback-only check reports a port
    as free that somebody else is already serving. The run then starts a
    server nobody reaches, sends every request to the other application, and
    reports its 404s as bugs in this one -- which is exactly the confusion
    verify/README.md exists to head off, and it caught this script out first.
    """
    for candidate in (preferred, 0):
        if candidate:
            if _bindable("0.0.0.0", candidate) and _bindable("127.0.0.1", candidate):
                return candidate
            continue
        picked = _bindable("0.0.0.0", 0)
        if picked and _bindable("127.0.0.1", picked):
            return picked
    raise RuntimeError("no free port")


def wait_for(url, timeout=90, expect=None):
    """Poll `url` until it answers. Returns (ok, last_body)."""
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                body = response.read().decode("utf-8", "replace")
                if expect is None or expect in body:
                    return True, body
                last = body
        except urllib.error.HTTPError as exc:
            last = "HTTP %d" % exc.code
        except Exception as exc:  # connection refused while it boots
            last = str(exc)
        time.sleep(1.0)
    return False, last


class Servers:
    """The API and the built frontend, started for the live stages."""

    def __init__(self, ctx, api_port, web_port):
        self.ctx = ctx
        self.api_port = api_port
        self.web_port = web_port
        self.procs = []
        self.logs = []

    def _spawn(self, cmd, cwd, env=None, log_name="server"):
        """Start a server, with its output on disk.

        To a pipe nobody reads, a chatty server eventually blocks on a full
        buffer and hangs; and when startup fails, a swallowed traceback leaves
        nothing to report but "it did not come up", which says where to look
        and nothing about what happened.
        """
        merged = dict(os.environ)
        merged.update(env or {})
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        handle = open(LOG_DIR / ("%s.log" % log_name), "w", encoding="utf-8", errors="replace")
        self.logs.append(handle)
        proc = subprocess.Popen(
            cmd, cwd=str(cwd), env=merged,
            stdout=handle, stderr=subprocess.STDOUT,
        )
        self.procs.append(proc)
        return proc

    @staticmethod
    def tail(log_name, lines=25):
        path = LOG_DIR / ("%s.log" % log_name)
        if not path.exists():
            return "(no log)"
        text = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(text[-lines:])

    def start_api(self):
        # PORT is read by verify/serve_api.py, a thin wrapper around the same
        # create_app() the real entry point uses -- so this is the application
        # under test, not a stand-in for it.
        #
        # APP_ENV=testing puts it on `doctor_test`. The browser pass signs in,
        # and signing in writes: sessions, audit rows, notifications. Against
        # the practice's own database that would leave fixture accounts and
        # stray records among real patients.
        self._spawn(
            [backend_python(), str(HERE / "serve_api.py")],
            cwd=self.ctx.backend,
            env={
                "PORT": str(self.api_port),
                "APP_ENV": "testing",
                # dev.ini pins cors_origins to the dev server's :5173. The
                # browser pass is served from the preview port instead, so
                # without this every request it makes is blocked before it
                # leaves the browser and the only symptom is the login form
                # saying "Unable to sign in" -- which reads as a broken login
                # rather than as a CORS refusal.
                "CORS_ORIGINS": "http://127.0.0.1:%d,http://localhost:%d"
                % (self.web_port, self.web_port),
            },
            log_name="api",
        )
        # `expect` matters as much as the timeout: another application
        # answering on this port would satisfy a bare "did anything reply?"
        # check and the whole run would proceed against the wrong server.
        url = "http://127.0.0.1:%d/api/health" % self.api_port
        ok, body = wait_for(url, timeout=120, expect='"status"')
        return ok, body

    def build_web(self):
        """Build a bundle that points at the API this run actually started.

        Vite inlines `import.meta.env.VITE_API_BASE_URL` at **build** time, so
        setting it for `vite preview` would do nothing at all -- the bundle in
        frontend/dist carries whatever frontend/.env said when it was built,
        which is port 5000. That is the contested port, so the browser pass
        would quietly be testing whichever application won the bind.
        Built into its own directory rather than over frontend/dist, so the
        artifact the build stage validated stays the one that ships.
        """
        npm = "npm.cmd" if os.name == "nt" else "npm"
        code, out = run_cmd(
            [npm, "exec", "--", "vite", "build", "--outDir", str(E2E_DIST), "--emptyOutDir"],
            cwd=self.ctx.frontend,
            timeout=900,
            env={"VITE_API_BASE_URL": "http://127.0.0.1:%d/api" % self.api_port},
        )
        return code == 0, out

    def start_web(self):
        npm = "npm.cmd" if os.name == "nt" else "npm"
        self._spawn(
            # --host 127.0.0.1 is not optional: `vite preview` defaults to
            # binding the name `localhost`, which resolves to ::1 first on
            # Windows, so the server comes up on IPv6 only and every IPv4
            # probe is refused while the log cheerfully reports it running.
            [npm, "exec", "--", "vite", "preview",
             "--outDir", str(E2E_DIST),
             "--host", "127.0.0.1",
             "--port", str(self.web_port), "--strictPort"],
            cwd=self.ctx.frontend,
            log_name="web",
        )
        ok, _ = wait_for("http://127.0.0.1:%d/" % self.web_port, timeout=90)
        return ok

    def stop(self):
        for proc in self.procs:
            if proc.poll() is not None:
                continue
            try:
                proc.terminate()
                proc.wait(timeout=10)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        self.procs = []
        for handle in self.logs:
            try:
                handle.close()
            except Exception:
                pass
        self.logs = []


def run_check(module, ctx, stages):
    stage = Stage(module.NAME, module.TITLE)
    stages.append(stage)
    print("\n%s>> %s%s" % (BOLD, module.TITLE, RESET))
    started = time.time()
    try:
        stage.findings = module.run(ctx) or []
    except Exception as exc:
        import traceback

        stage.findings = [
            Finding(ERROR, "The check itself failed: %s" % exc,
                    where=module.NAME, detail=traceback.format_exc()[-900:])
        ]
    stage.seconds = time.time() - started
    stage.status = "failed" if stage.errors else "passed"
    _print_stage(stage)
    return stage


def run_command_stage(name, title, cmd, cwd, stages, env=None, timeout=1800,
                      tail=25, ok_codes=(0,)):
    """A stage that is an existing project command -- lint, build, a suite.

    The project's own gates are invoked as they are documented, not
    reimplemented, so this workflow and a developer running them by hand can
    never disagree about what passing means.
    """
    stage = Stage(name, title)
    stages.append(stage)
    print("\n%s>> %s%s" % (BOLD, title, RESET))
    print("%s   $ %s%s" % (DIM, cmd if isinstance(cmd, str) else " ".join(cmd), RESET))
    started = time.time()
    code, out = run_cmd(cmd, cwd=cwd, timeout=timeout, env=env)
    stage.seconds = time.time() - started

    if code in ok_codes:
        stage.status = "passed"
        summary = [ln for ln in out.splitlines() if ln.strip()][-3:]
        for line in summary:
            print("    %s%s%s" % (DIM, line[:160], RESET))
    else:
        stage.status = "failed"
        lines = [ln for ln in out.splitlines() if ln.strip()][-tail:]
        stage.findings = [
            Finding(ERROR, "%s failed (exit %d)" % (title, code),
                    where=str(cwd), detail="\n".join(lines))
        ]
    _print_stage(stage)
    return stage


def _print_stage(stage):
    for finding in stage.findings:
        print(finding.render())
    mark = {"passed": GREEN + "PASS" + RESET,
            "failed": RED + "FAIL" + RESET,
            "skipped": YELLOW + "SKIP" + RESET}[stage.status]
    extra = ""
    if stage.warnings:
        extra = " %s(%d warning%s)%s" % (
            YELLOW, len(stage.warnings), "" if len(stage.warnings) == 1 else "s", RESET
        )
    if stage.note:
        extra += " %s-- %s%s" % (DIM, stage.note, RESET)
    print("   %s  %s  %s(%.1fs)%s%s"
          % (mark, stage.title, DIM, stage.seconds, RESET, extra))


def report(stages, strict, started):
    print("\n" + "=" * 72)
    print("%sVERIFICATION REPORT%s" % (BOLD, RESET))
    print("=" * 72)

    failed = [s for s in stages if s.status == "failed"]
    warned = [s for s in stages if s.warnings]
    skipped = [s for s in stages if s.status == "skipped"]

    for stage in stages:
        mark = {"passed": GREEN + "pass" + RESET,
                "failed": RED + "FAIL" + RESET,
                "skipped": YELLOW + "skip" + RESET}[stage.status]
        line = "  %s  %-38s %6.1fs" % (mark, stage.title, stage.seconds)
        if stage.errors:
            line += "  %d error%s" % (len(stage.errors),
                                      "" if len(stage.errors) == 1 else "s")
        if stage.warnings:
            line += "  %d warning%s" % (len(stage.warnings),
                                        "" if len(stage.warnings) == 1 else "s")
        if stage.note:
            line += "  (%s)" % stage.note
        print(line)

    if failed:
        print("\n%sIssues that must be fixed%s" % (BOLD, RESET))
        for stage in failed:
            for finding in stage.errors:
                print("\n  %s[%s]%s %s" % (RED, stage.title, RESET, finding.summary))
                if finding.where:
                    print("    at %s" % finding.where)
                if finding.detail:
                    for line in str(finding.detail).splitlines()[:12]:
                        print("      %s" % line)

    if warned:
        print("\n%sWarnings (read, do not necessarily act)%s" % (BOLD, RESET))
        for stage in warned:
            for finding in stage.warnings:
                print("  %s[%s]%s %s" % (YELLOW, stage.title, RESET, finding.summary))
                if finding.where:
                    print("    at %s" % finding.where)

    elapsed = time.time() - started
    total_warnings = sum(len(s.warnings) for s in stages)
    print("\n" + "-" * 72)
    ok = not failed and not (strict and total_warnings)
    if ok:
        print("%s%d stage%s passed%s in %.1fs%s"
              % (GREEN + BOLD, len(stages) - len(skipped),
                 "" if len(stages) - len(skipped) == 1 else "s",
                 (", %d skipped" % len(skipped)) if skipped else "",
                 elapsed, RESET))
    else:
        print("%s%d stage%s failed%s in %.1fs%s"
              % (RED + BOLD, len(failed), "" if len(failed) == 1 else "s",
                 (", %d warning%s promoted by --strict"
                  % (total_warnings, "" if total_warnings == 1 else "s"))
                 if strict and total_warnings else "",
                 elapsed, RESET))
    print("-" * 72)
    return 0 if ok else 1


def main():
    parser = argparse.ArgumentParser(description="Run the full verification workflow.")
    parser.add_argument("--quick", action="store_true",
                        help="static checks and build only -- no servers, no database")
    parser.add_argument("--no-e2e", action="store_true", help="skip the browser pass")
    parser.add_argument("--no-suites", action="store_true",
                        help="skip the two backend flow suites (they need MySQL)")
    parser.add_argument("--strict", action="store_true", help="warnings fail the run")
    parser.add_argument("--json", metavar="PATH", help="also write a JSON report")
    parser.add_argument("--api-port", type=int, default=5001)
    parser.add_argument("--web-port", type=int, default=4173)
    args = parser.parse_args()

    started = time.time()
    ctx = Ctx()
    stages = []

    print("%sMediAssist AI -- verification workflow%s" % (BOLD, RESET))
    print("%s%s%s" % (DIM, ROOT, RESET))

    # -- 0. do the detectors still detect? --------------------------------
    # First, and quick. Everything after this trusts the checks to speak up,
    # and a check that has quietly stopped matching anything is indis-
    # tinguishable from a clean codebase -- see verify/selftest.py.
    run_command_stage("selftest", "Detector self-test",
                      [backend_python(), str(HERE / "selftest.py")],
                      ROOT, stages, timeout=300)

    # -- 1. static: nothing needs to be running ---------------------------
    for module in STATIC_CHECKS:
        run_check(module, ctx, stages)

    # -- 2. the project's own frontend gates ------------------------------
    npm = "npm.cmd" if os.name == "nt" else "npm"
    run_command_stage("lint", "Frontend lint (oxlint)",
                      [npm, "run", "lint"], ctx.frontend, stages)
    run_command_stage("build", "Frontend production build",
                      [npm, "run", "build"], ctx.frontend, stages)

    # Type checking: this frontend is JSX with no tsconfig and the backend
    # carries no annotations, so there is nothing to type-check. Recorded as
    # skipped rather than omitted -- a stage that silently disappears is how
    # a check stops running without anybody noticing.
    typed = Stage("typecheck", "Type checking")
    typed.status = "skipped"
    typed.note = "no TypeScript or type annotations in this project"
    stages.append(typed)
    _print_stage(typed)

    # -- 3. the backend flow suites ---------------------------------------
    if args.quick or args.no_suites:
        for name, title in (("suite-practice", "Backend suite: practice flow"),
                            ("suite-portal", "Backend suite: patient portal")):
            stage = Stage(name, title)
            stage.status = "skipped"
            stage.note = "--quick" if args.quick else "--no-suites"
            stages.append(stage)
            _print_stage(stage)
    else:
        run_command_stage("suite-practice", "Backend suite: practice flow",
                          [backend_python(), "-m", "tests.test_practice_flow"],
                          ctx.backend, stages, timeout=1800)
        run_command_stage("suite-portal", "Backend suite: patient portal",
                          [backend_python(), "-m", "tests.test_patient_portal_flow"],
                          ctx.backend, stages, timeout=1800)

    # -- 4. live: the API, and the browser --------------------------------
    if args.quick:
        for name, title in (("api-health", "Live API health"),
                            ("e2e", "End-to-end browser pass")):
            stage = Stage(name, title)
            stage.status = "skipped"
            stage.note = "--quick"
            stages.append(stage)
            _print_stage(stage)
        return finish(stages, args, started)

    api_port = free_port(args.api_port)
    web_port = free_port(args.web_port)
    servers = Servers(ctx, api_port, web_port)
    try:
        print("\n%s>> Starting the application%s" % (BOLD, RESET))
        print("%s   api  http://127.0.0.1:%d/api%s" % (DIM, api_port, RESET))
        creds = _prepare_e2e_db(ctx, stages)
        ok, body = servers.start_api()
        ctx.api_base = "http://127.0.0.1:%d/api" % api_port
        ctx.live = ok

        if not ok:
            stage = Stage("api-health", "Live API health")
            stage.status = "failed"
            foreign = "did you mean" in body or "404" in body
            stage.findings = [
                Finding(
                    ERROR,
                    "Another application is answering on port %d" % api_port
                    if foreign
                    else "The API did not come up",
                    where="backend/app.py",
                    detail=(
                        "Something replied on %s/health, but not this "
                        "application. Two processes can hold one port on "
                        "Windows -- stop the other server, or pass a different "
                        "--api-port.\n" % ctx.api_base
                        if foreign
                        else "No answer on %s/health within 120s.\n" % ctx.api_base
                    )
                    + body[-500:]
                    + "\n\n--- server log ---\n"
                    + Servers.tail("api"),
                )
            ]
            stages.append(stage)
            _print_stage(stage)
        else:
            run_check(api_health, ctx, stages)

        # -- the browser pass --
        stage = Stage("e2e", "End-to-end browser pass")
        stages.append(stage)
        if args.no_e2e:
            stage.status = "skipped"
            stage.note = "--no-e2e"
            _print_stage(stage)
        elif not ok:
            stage.status = "skipped"
            stage.note = "the API never came up"
            _print_stage(stage)
        else:
            print("%s   web  http://127.0.0.1:%d%s" % (DIM, web_port, RESET))
            built, out = servers.build_web()
            if not built:
                stage.status = "failed"
                stage.findings = [
                    Finding(ERROR, "Could not build the bundle for the browser pass",
                            where="frontend/", detail=out[-800:])
                ]
                _print_stage(stage)
            elif not servers.start_web():
                stage.status = "failed"
                stage.findings = [
                    Finding(ERROR, "The preview server did not come up",
                            where="frontend/", detail="vite preview never answered.")
                ]
                _print_stage(stage)
            elif not creds:
                stage.status = "skipped"
                stage.note = "no credentials -- see the database stage"
                _print_stage(stage)
            else:
                ctx.web_base = "http://127.0.0.1:%d" % web_port
                _run_e2e(stage, ctx, creds)
    finally:
        servers.stop()

    return finish(stages, args, started)


def _prepare_e2e_db(ctx, stages):
    """Make sure `doctor_test` is usable and report the logins to sign in with.

    Returns the credentials, or None -- in which case the browser pass is
    skipped rather than run against a database it cannot enter.
    """
    stage = Stage("e2e-db", "Test database and fixtures")
    stages.append(stage)
    print("\n%s>> Test database and fixtures%s" % (BOLD, RESET))
    started = time.time()
    code, out = run_cmd(
        [backend_python(), str(HERE / "e2e_setup.py")], cwd=ctx.backend, timeout=900
    )
    stage.seconds = time.time() - started

    if "---JSON---" not in out:
        stage.status = "failed"
        stage.findings = [
            Finding(
                ERROR,
                "Could not prepare the test database",
                where="verify/e2e_setup.py",
                detail="`doctor_test` must exist before a run -- TestingConfig "
                "derives the name but will not create the database:\n"
                "  CREATE DATABASE doctor_test CHARACTER SET utf8mb4 "
                "COLLATE utf8mb4_unicode_ci;\n\nexit %d\n%s" % (code, out[-900:]),
            )
        ]
        _print_stage(stage)
        return None

    creds = json.loads(out.split("---JSON---", 1)[1].strip().splitlines()[0])
    stage.status = "passed"
    stage.note = "doctor_test ready, PA fixture present"
    _print_stage(stage)
    return creds


def _run_e2e(stage, ctx, creds):
    """Hand off to the Playwright pass and read back its JSON findings."""
    print("\n%s>> End-to-end browser pass%s" % (BOLD, RESET))
    started = time.time()
    node = "node"
    code, out = run_cmd(
        [node, str(HERE / "e2e" / "run_e2e.mjs")],
        cwd=HERE / "e2e",
        timeout=1800,
        env={
            "WEB_BASE": ctx.web_base,
            "API_BASE": ctx.api_base,
            "DOCTOR_EMAIL": creds["doctor"]["email"],
            "DOCTOR_PASSWORD": creds["doctor"]["password"],
            "PA_EMAIL": creds["pa"]["email"],
            "PA_PASSWORD": creds["pa"]["password"],
        },
    )
    stage.seconds = time.time() - started

    payload = None
    if "---JSON---" in out:
        try:
            payload = json.loads(out.split("---JSON---", 1)[1].strip())
        except json.JSONDecodeError:
            payload = None

    if payload is None:
        stage.status = "failed"
        stage.findings = [
            Finding(ERROR, "The browser pass produced no report",
                    where="verify/e2e/run_e2e.mjs",
                    detail="exit %d\n%s" % (code, out[-1500:]))
        ]
    else:
        for row in payload.get("findings", []):
            stage.findings.append(
                Finding(row.get("severity", ERROR), row.get("summary", ""),
                        where=row.get("where", ""), detail=row.get("detail", ""))
            )
        stage.status = "failed" if stage.errors else "passed"
        stage.note = "%d screens, %d checks" % (
            payload.get("screens", 0), payload.get("checks", 0)
        )
    _print_stage(stage)


def finish(stages, args, started):
    code = report(stages, args.strict, started)
    if args.json:
        path = Path(args.json)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "ok": code == 0,
                    "seconds": round(time.time() - started, 1),
                    "stages": [
                        {
                            "name": s.name,
                            "title": s.title,
                            "status": s.status,
                            "seconds": round(s.seconds, 1),
                            "note": s.note,
                            "findings": [
                                {
                                    "severity": f.severity,
                                    "summary": f.summary,
                                    "where": f.where,
                                    "detail": f.detail,
                                }
                                for f in s.findings
                            ],
                        }
                        for s in stages
                    ],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print("JSON report: %s" % path)
    return code


if __name__ == "__main__":
    sys.exit(main())
