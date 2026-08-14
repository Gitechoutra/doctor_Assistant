# Yasodha AI Medical Assistant

An AI-powered voice consultation system for hospital use: doctors and
patients speak naturally, the conversation is transcribed live, and Gemini
generates a clinical summary, assistive diagnosis, prescription suggestions
(drawn only from the hospital's medicine formulary), and a downloadable PDF
report.

## Status: Milestone 1 — Foundation

This milestone delivers: MySQL schema, Flask backend (JWT auth, dashboard
API), and a React + Tailwind frontend (landing page, login, dashboard shell)
wired end-to-end against real data.

**Not yet built** (future milestones): live voice consultation UI, WebSocket
transcript streaming, Gemini summarization/prescription generation, Whisper
STT, PDF report generation, full CRUD for patients/doctors/medicines,
deployment.

## Structure

```
AI_medical/
├── backend/        Flask API (see backend/README below)
├── frontend/        React + Vite + Tailwind app
├── database/        schema.sql (generated snapshot of the built schema) and
│                    archive/ (dumps of tables dropped from the live schema)
└── documentation/    setup notes
```

## Quick start

### 1. Database

MySQL database `hospital` already created locally. To recreate elsewhere:

```sql
CREATE DATABASE hospital CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend
python -m venv venv
./venv/Scripts/activate            # Windows
pip install -r requirements.txt
cp config/dev.ini.example config/dev.ini   # then fill in the DB password,
                                           # secret keys and Gemini key
flask db upgrade                    # create tables
python -m portal.seeds              # seed roles, admin account, and default medicine master data
python app.py                       # http://127.0.0.1:5000
```

Configuration lives in `backend/config/dev.ini` (git-ignored). `config.py`
reads it, or `config/prod.ini` when `APP_ENV=production`; any single value
can be overridden by an environment variable of the name documented in
`dev.ini.example`, so a server never needs the file on disk.

The one seeded login is the administrator:

- Admin: `goddumahesh2@gmail.com` (or the username `admin`) / `Admin@123`

Override it with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME`
before the first run — see `portal/seeders/seed_admin.py`, which also brings an
existing admin back in step with those values on every start.

**No doctor or nurse account is seeded.** Create staff through Staff
Management once signed in as the admin; each new account is emailed a
temporary password and a single-use link to set their own.

The seeder creates reference data: roles, the default admin account, the
departments, and the default medicine master data (the clinical formulary and
the pharmacy brand catalogue, in `portal/seeders/seed_medicines.py`) — every
developer gets the same medicines after `git pull` without inserting them by
hand. Re-running `python -m portal.seeds` is always safe: existing rows,
including any medicine a developer added or edited manually, are left
untouched. It deliberately does not create patients: a patient with no
assigned doctor is invisible to every doctor (see
`portal/helpers/patient_access.py`), so demo rows only ever showed up as
clutter. Register patients through the front desk instead.

`portal/seeders/seed_core.py` still holds demo staff, patients and stock if
sample content is ever wanted; it is run by hand, never automatically.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

`frontend/.env` sets `VITE_API_BASE_URL` (defaults to
`http://127.0.0.1:5000/api`).

## Verifying it works

1. Start the backend, then the frontend.
2. Open `http://localhost:5173` → landing page.
3. Click **Get Started** / **Sign in** → log in with the seeded doctor
   account above.
4. You should land on `/dashboard` showing the doctor's name and live
   (currently zero/seed-level) counts pulled from MySQL — not hardcoded
   numbers.

## Tests

```bash
cd backend
python tests/test_flows.py     # every module, end to end, all seven roles
python tests/test_shifts.py    # the shift module in depth
```

Both run against `<DB_NAME>_test`, which they drop and rebuild from the models
on every run, and both refuse to start if the configured URL is not the test
one — they cannot reach live patient records. Neither needs pytest; plain
asserts and a pass/fail tally, so a fresh checkout can run them with nothing
installed beyond the application's own requirements.

`test_flows.py` follows a hospital day in order — registration, the OP queue,
the consultation and its prescription, the case, the surgical pathway, the
nursing hand-off, the lab, the pharmacy, staff administration — and asserts
the authorization boundary at each step, which is where the module's rules
actually live.

## Nursing module

After a consultation, surgery or procedure the doctor hands the patient to a
nurse for the observation period. That hand-off — a **nursing assignment** —
is what scopes the whole module: a nurse sees exactly the patients assigned to
them, and every medication log, observation, note and alert hangs off one.

Ownership is split, and enforced server-side rather than only hidden in the UI:

| | Doctor | Nurse |
|---|---|---|
| Assign / reassign / close the watch | ✅ | — |
| Treatment plan & care instructions | ✅ | read-only |
| Medication schedule (which drugs, how often) | ✅ | read-only |
| Log each dose (completed / delayed / missed / skipped) | — | ✅ |
| Vitals, symptoms, recovery, complications | — | ✅ |
| Nursing notes & shift handover | — | ✅ |
| Raise an alert | — | ✅ |
| Acknowledge / resolve an alert | ✅ | — |

Neither side can do the other's job, which is what makes the record an audit
trail rather than a shared scratchpad.

**Escalation is partly automatic.** Marking a dose *missed*, or recording
vitals outside the ward ranges in `models/patient_observation.py`, raises a
clinical alert and notifies the treating doctor without the nurse having to
remember to escalate. Anything else the nurse flags by hand.

**Where things live**

- Nurse portal: `/nurse/login` → `/nurse` (its own layout; doctors and admins
  are redirected out, and nurses are redirected out of `/dashboard`)
- Doctor's remote monitor: `/dashboard/nursing` — compliance, open alerts and
  the full nursing log for every patient they've handed over
- API: `/api/nursing/*` (`routes/nursing_routes.py`), scoped by
  `helpers/nursing_access.py`
- Live updates ride a `nursing_changed` socket event, so a doctor watching a
  record sees the nurse's entries as they land

The timeline at `GET /api/nursing/assignments/<id>/timeline` is assembled from
the four record tables on read — there is no separate timeline table, so there
is no second copy of the truth to disagree with the first.
