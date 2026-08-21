# Verification

One command that tries to break this application, and says so in a form you
can act on.

```bash
./verify.ps1            # Windows
./verify.sh             # everywhere else
python verify/run.py    # or straight to it
```

Exit code is 0 only if every stage passed. Nothing here is a new opinion about
how the code should be written — the linter, the build and the two backend
suites are the project's own gates, invoked exactly as they are documented.
What is new is the set of checks that sit between them, in the gaps where this
codebase has actually broken before.

## What it runs, and why each one exists

| Stage | Catches |
|---|---|
| Detector self-test | A check that has silently stopped checking |
| Dependency validation | An import that works only because something else pulls it in |
| Backend syntax and import sweep | A module that raises the first time a route needs it |
| Frontend/backend API contract | A call whose path no route serves — the "button does nothing" bug |
| Frontend route and navigation integrity | A nav entry or link that lands nowhere |
| Local/UTC clock discipline | The two clocks mixed — the bug this repo keeps re-growing |
| Frontend lint (oxlint) | The project's own lint gate |
| Frontend production build | The project's own build gate |
| Backend suites (×2) | The project's own 194 end-to-end assertions |
| Test database and fixtures | `doctor_test` missing, or no PA to sign in as |
| Live API health and boundaries | An auth boundary that moved; the wrong server on the port |
| End-to-end browser pass | Blank screens, crashes, dead buttons, failed requests |

Useful flags:

- `--quick` — everything that needs no server and no database. Seconds, not minutes.
- `--no-e2e` — skip the browser.
- `--no-suites` — skip the two backend suites when MySQL is not to hand.
- `--strict` — warnings fail the run too.
- `--json report.json` — a machine-readable report alongside the printed one.

## Errors and warnings

An **error** fails the run: something is broken, and the report says where.

A **warning** does not. It is something a person should decide about, and the
distinction is deliberate — a check that fails the build over a judgement call
gets switched off, and then it is not checking anything. Two of the warnings
this currently reports are exactly that shape: `torch` and `openai-whisper` are
still declared in `requirements.txt` although transcription moved to Gemini's
hosted audio and nothing imports either one. Removing them is a real decision
with a real cost if it is wrong, so the harness reports it and leaves it.

## The port trap

**Two applications on this machine bind port 5000, and Windows lets both
succeed.** Whichever bound last serves the connections, and in practice the
other one wins. The Doctor frontend then gets somebody else's router, which
answers `/api/*` with a 404.

This is what "the dropdowns don't open" and "white screen on that sidebar
option" have turned out to mean here before. The pages render; every data call
404s; lists come back empty and anything that dereferences the missing data
blanks its panel. Nothing is wrong with the React.

```bash
netstat -ano | grep ":5000" | grep LISTENING
```

More than one row means the symptom is environmental. So this harness never
uses 5000: it picks a port, confirms it is free on **both** `0.0.0.0` and
`127.0.0.1` — a loopback-only check is not enough, which is a lesson this
script learned by being fooled itself — and then refuses to proceed unless the
server answering is this application. `api_health` asserts identity before it
asserts anything else, so a foreign 404 is reported as a misconfigured
environment rather than as a pile of bugs in code that is fine.

## Where it runs

Against **`doctor_test`**, never the practice's own database. The browser pass
signs in, and signing in writes — sessions, audit rows, notifications. The
schema is created if missing and never dropped, so when the suites have just
run, the browser pass inherits their patients, appointments and finished
consultation and gets real screens to render instead of a wall of empty states.

`doctor_test` has to exist first. `TestingConfig` derives the name by suffixing
the configured one but will not create the database:

```sql
CREATE DATABASE doctor_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

There is no seeded PA — the doctor creates the desk's accounts and that route
emails the password rather than returning it — so `e2e_setup.py` makes one as a
fixture, the same way both suites do. The doctor's login comes from the seeder,
so the pass signs in as whoever this deployment actually seeded.

## The browser pass

`e2e/run_e2e.mjs` drives the built frontend with Playwright, as both roles,
watching four channels on every screen: uncaught exceptions, console errors,
requests that never landed, and API responses in the 4xx/5xx range. It also
checks that something actually rendered, because a screen can crash quietly and
leave a document that is technically fine and visibly empty.

It builds its own bundle into `.e2e-dist` rather than serving `frontend/dist`.
Vite inlines `VITE_API_BASE_URL` at **build** time, so a bundle built from
`frontend/.env` points at port 5000 no matter what the preview server is told —
straight into the trap above. Building separately also leaves the artifact the
build stage validated as the one that ships.

## Adding a check

A detector is a module in `checks/` with `NAME`, `TITLE` and
`run(ctx) -> list[Finding]`. Add it to `STATIC_CHECKS` in `run.py`.

Then add a fixture to `selftest.py` — a fault it must see, and the corrected
form it must stay quiet about. This is not ceremony. `frontend_routes` was
written to scan for `to="/path"`, the JSX attribute, while `Sidebar.jsx` writes
its entries as `{ to: "/path" }`, object properties: both navigation menus, the
exact thing the check existed for, were invisible to it. It passed confidently
until a bogus nav entry was added by hand and it said nothing. Every fixture in
`selftest.py` is one of those experiments, kept.

## CI

`.github/workflows/verify.yml` runs this same command on every push and pull
request, against a real MySQL service. It installs the CPU-only torch wheels —
the default build pulls roughly 2GB of CUDA that nothing here imports — and
uploads the JSON report and the server logs on failure, which is all a red
pipeline otherwise leaves you.
