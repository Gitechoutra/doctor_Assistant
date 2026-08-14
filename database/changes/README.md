# Forward schema changes

`backend/migrations/versions/` once tracked the Alembic chain for changes
like these, but as of 2026-08-12 that directory's version files were removed
from git and `migrations/` was added to `.gitignore` — there is no usable
Alembic chain in this checkout. Until that's restored, a schema change ships
as a plain, dated `.sql` script here instead.

Each file is a hand-written set of `ALTER TABLE` statements (not a
`mysqldump`, unlike `database/archive/`). To apply one:

```bash
mysql -h 127.0.0.1 -u root -p doctor < 2026-08-20_example_change.sql
```

After applying, `database/schema.sql` is hand-edited to match, so the tracked
dump stays a truthful snapshot of the live schema.

## Knowing when one is outstanding

Nothing forces a script here to be run, and a database one `ALTER` behind
starts, connects and serves the login page — it fails only on the flow that
needed the missing piece, as a 500 nobody can read. Both scripts dated
2026-08-13 were exactly that: `notifications.category` had never gained
`patient_assignment`, so registering a patient (ADD OP) failed on the
notification to the assigned doctor and rolled the patient and their OP back
with it.

So the backend compares the live schema against the models on every start and
logs the difference (`portal/helpers/bootstrap.ensure_schema`). A run with
nothing outstanding says

```
Schema check: all 37 tables match the models
```

and one that is behind names each missing column and enum value and points
here. It only ever reports — applying a script is still a decision somebody
makes, with the data in front of them.
