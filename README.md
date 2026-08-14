# MediAssist AI

**Smart Practice Management for Doctors.**

A practice management system for one doctor and their PA (Personal Assistant).
The PA registers patients, books appointments and runs the day's queue; the
doctor calls patients in, records the consultation, prescribes and signs. Both
work from the same records, so neither has to ask the other what happened.

The consultation itself is voice-assisted: the conversation is transcribed, and
Gemini drafts a clinical summary, an assistive diagnosis and a prescription
suggestion drawn only from the practice's own formulary. None of it counts
until the doctor reviews and signs it, and editing a signed prescription clears
the signature.

## Two roles, and only two

| | PA | Doctor |
|---|---|---|
| Register / edit patients | ✅ | edit only |
| Book, reschedule, cancel, check in | ✅ | ❌ |
| See the day's queue | ✅ | ✅ |
| Start / end a consultation | ❌ | ✅ |
| Diagnose, prescribe, sign off | ❌ | ✅ |
| Issue a report | ❌ | ✅ |
| **Read** consultations, prescriptions, reports | ✅ | ✅ |

The split is separation of duties, not seniority. The PA can read the whole
clinical record — that is what running a desk requires, since patients ring up
and ask — but cannot write to any of it. Enforced on the server
(`portal/helpers/decorators.py`), not merely hidden in the interface.

## Structure

```
doctor_Assistant/
├── backend/        Flask API + MySQL
├── frontend/       React + Vite + Tailwind
├── database/       schema.sql (generated snapshot) and change scripts
└── documentation/  setup notes
```

## Quick start

### 1. Database

```sql
CREATE DATABASE doctor CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend
python -m venv venv
./venv/Scripts/activate                # Windows
pip install -r requirements.txt
# Fill in config/dev.ini: DB password, secret keys, Gemini key.
python -c "from portal import create_app; from portal.extensions import db; \
           app=create_app(); app.app_context().push(); db.create_all()"
python app.py                          # http://127.0.0.1:5000
```

The first start creates everything the practice needs to run: the two roles,
the two accounts, the doctor's practice profile, and the prescribing catalogue.
See `portal/helpers/bootstrap.py` — every check is additive and runs on every
start, so a fresh clone or a restored dump comes up usable.

**The two seeded logins:**

| Role | Sign in as | Password |
|---|---|---|
| PA | `pa@mediassist.local` | `PA@12345` |
| Doctor | `doctor@mediassist.local` | `Doctor@12345` |

Change them. Set `SEED_PA_PASSWORD` and `SEED_DOCTOR_PASSWORD` in the
environment, or change the passwords after the first sign-in and set
`SEED_ACCOUNT_SYNC=false` so a restart leaves them alone. Names, emails and the
doctor's specialisation are configurable the same way — see
`portal/seeders/seed_accounts.py`.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env       # set VITE_API_BASE_URL=http://127.0.0.1:5000/api
npm run dev                # http://localhost:5173
```

## Tests

```bash
cd backend
python -m tests.test_practice_flow
```

Walks the whole workflow end to end against a real MySQL database
(`doctor_test`, which TestingConfig derives by suffixing the configured name,
so a run can never touch live records): registration → booking → the queue →
the consultation → sign-off → the report, plus the authorization boundaries
that make the two roles mean something. No mocks; every assertion goes through
the HTTP layer.

```bash
cd frontend
npm run lint
npm run build
```

## How a visit flows

```
PA registers the patient
      ↓
PA books them in  (a slot next week, or a walk-in at the desk)
      ↓
Patient arrives → checked in → joins today's queue, numbered
      ↓
Doctor sees them in the same queue, at the same position
      ↓
Doctor starts the consultation  →  PA's board shows "In Consultation"
      ↓
Doctor records, diagnoses, prescribes, signs
      ↓
Doctor ends it  →  patient leaves the queue, everyone behind moves up
      ↓
The visit joins the patient's history; the PA can read it back
```

Both screens stay in step over a WebSocket (`helpers/broadcast.py`): the doctor
presses Start and the number on the desk's screen moves, without anybody
pressing refresh.

## Notes on the architecture

**One doctor.** `helpers/practice.practice_doctor()` is the single place that
answers "which doctor?", so registration and booking resolve it rather than
offering a chooser with one option. It is written to survive a second doctor
joining: every record stores the id it resolved, so the change would be a
chooser on two forms, not a schema migration.

**No departments, no stock.** Prescribing reads the practice's whole catalogue.
A practice dispenses nothing — the patient takes the prescription to whichever
chemist they use — so gating the picker on inventory would have shown the
doctor an empty formulary.

**Queue positions are numbers.** 0 is whoever is with the doctor, 1..n are
waiting, in arrival order, computed server-side
(`helpers/queue_helper.number_queue`) so the desk and the consulting room can
never disagree. The PA reads a position out loud; a decorative dot cannot be
read out.
