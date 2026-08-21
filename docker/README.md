# Running MediAssist AI in Docker

Everything Docker needs lives in this folder. Nothing outside it was moved,
renamed or rewritten — the containers run `backend/app.py` and the frontend's
own `npm run build` exactly as the project already does.

## Quick start

```bash
cd docker
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
# fill in SECRET_KEY, JWT_SECRET_KEY, DB_PASSWORD, MYSQL_ROOT_PASSWORD
cd ..
docker compose -f docker/compose.yaml up -d --build
```

Then:

| | Address |
|---|---|
| App | http://localhost:5173 |
| API | http://localhost:5000/api |
| Health | http://localhost:5000/api/health |

Sign in as the doctor with the credentials in
`backend/portal/seeders/seed_doctor.py` — unchanged by containerising. There is
no seeded PA; the doctor creates assistant accounts under **Assistants**, as
before.

Watch it come up:

```bash
docker compose -f docker/compose.yaml ps
docker compose -f docker/compose.yaml logs -f backend
```

Stop, and stop-and-erase:

```bash
docker compose -f docker/compose.yaml down       # keeps the database
docker compose -f docker/compose.yaml down -v    # deletes it, and the uploads
```

## What runs

| Service | Image | Host port | Container port |
|---|---|---|---|
| `frontend` | built here → nginx (unprivileged) | 5173 | 8080 |
| `backend` | built here → python:3.12-slim | 5000 | 5000 |
| `db` | mysql:8.4 | *not published* | 3306 |

The ports are the project's own: `backend/app.py` binds 5000, and 5173 is what
`vite.config.js`, `backend/config/dev.ini` (`cors_origins`,
`frontend_base_url`) and `frontend/.env.example` all name. MySQL is reachable
only from the other containers — open a prompt with
`docker compose -f docker/compose.yaml exec db mysql -u root -p`.

The browser calls the API across an origin, the same as it does today; there is
no reverse proxy in front of the API. That keeps the request path, the CORS
allow-list and the socket.io origin identical to the development setup.

### Port 5000 is taken on this machine

Another application already binds 5000 here. If `up` reports the port is in
use, change **both** of these in `docker/.env` together — the frontend bundle
has the API address compiled into it:

```
BACKEND_HOST_PORT=5050
PUBLIC_API_BASE_URL=http://localhost:5050/api
```

then `docker compose -f docker/compose.yaml up -d --build` again (the frontend
must be rebuilt, not just restarted, for a changed API address to take effect).

## Files

```
docker/
├── compose.yaml                     the three services, their wiring
├── .env.example                     every setting; copy to .env and fill in
├── .gitignore                       keeps .env out of the repository
├── backend.Dockerfile               Flask + Socket.IO image
├── backend.Dockerfile.dockerignore  what the backend build may see
├── entrypoint.sh                    waits for MySQL, then runs `python app.py`
├── frontend.Dockerfile              npm run build → nginx
├── frontend.Dockerfile.dockerignore what the frontend build may see
├── nginx/default.conf               static files + React Router fallback
└── mysql/init/20-test-database.sh   creates the empty `doctor_test` database
```

The two `*.Dockerfile.dockerignore` files are read by BuildKit in preference to
a `.dockerignore` at the context root, which is what lets every Docker file
stay in this folder without one being dropped into the project root. BuildKit
is the default builder in Docker 23 and later; if you have deliberately set
`DOCKER_BUILDKIT=0`, unset it or the build context will include `venv/`,
`node_modules/` and `.git`.

## Configuration and secrets

Nothing is hardcoded. `docker/.env` is the only place a credential is written,
it is git-ignored, and it stays on the host — compose reads it and injects the
values as environment variables, so no image layer contains it.

`backend/config/config.py` already prefers a real environment variable over
every other source, and the containers set `APP_ENV=production`, which points
it at `config/prod.ini` — a file that does not exist and is not created here.
So the container's configuration is entirely environmental.
`backend/.env` and `backend/config/dev.ini` are excluded from the build
context: your local credentials never reach the image.

Both application containers run as an unprivileged user (uid 10001 for the
backend, the nginx image's own uid 101 for the frontend) with
`no-new-privileges`. The database port is not published.

## Data

Three named volumes:

| Volume | Holds | Why it is a volume |
|---|---|---|
| `db_data` | MySQL's data directory | the practice's records |
| `backend_uploads` | avatars, patient photos, generated PDFs | part of the clinical record |
| `backend_logs` | `portal/logger.py`'s rotating log | readable after a crash |

On the **first** start of an empty `db_data`, MySQL imports the project's own
`database/schema.sql` (bind-mounted read-only) and then creates the empty
`doctor_test` database the backend test suite needs. Neither step runs again
while the volume exists, so no restart can touch existing data.

Because `database/schema.sql` names the `doctor` database in its own
`CREATE DATABASE`/`USE` statements — and that file belongs to the project, not
to this setup — leave `DB_NAME=doctor`.

## Tests

```bash
docker compose -f docker/compose.yaml exec backend python -m tests.test_practice_flow
docker compose -f docker/compose.yaml exec backend python -m tests.test_patient_portal_flow
```

They run against `doctor_test`, which `TestingConfig` derives by suffixing the
configured database name — a run cannot reach live records.

## Notes on two deliberate choices

**torch and openai-whisper are not installed.** Both are listed in
`backend/requirements.txt`, neither is imported anywhere in `backend/`, and
neither is present in the project's own virtualenv — the application runs
without them today. Leaving them out saves roughly a gigabyte per build.
`requirements.txt` itself is untouched; the filtering happens on a copy inside
the image. To include them:

```bash
docker compose -f docker/compose.yaml build \
  --build-arg INSTALL_TRANSCRIBER_EXTRAS=true backend
```

**ffmpeg comes from Debian, not from imageio-ffmpeg.**
`portal/ai/gemini_client.py` shells out to the literal command `ffmpeg` to
convert the browser's webm recording before transcription.
`portal/ai/ffmpeg_setup.py` copies imageio's bundled binary to
`.bin/ffmpeg.exe`, a name Linux will not resolve as `ffmpeg`. Installing
Debian's package makes the command resolvable and leaves that source file
alone. (`.bin/` is still created and writable in the image, because that module
writes to it on import and an unwritable directory would fail the import and
take the app down at start.)
