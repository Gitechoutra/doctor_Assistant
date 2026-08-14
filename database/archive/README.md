# Archived tables

Dumps of tables dropped from the live schema, kept so the data is recoverable
even though the application no longer has any code that reads it.

Each file is a plain `mysqldump` — `CREATE TABLE` plus the rows as they stood
on the day it was taken. To restore one:

```bash
mysql -h 127.0.0.1 -u root -p hospital < registration_requests_2026-08-12.sql
```

That recreates the table and its rows. It does **not** bring back the code:
the model and any routes were removed with the table, so a restored table is
inert until something is written against it again.

## registration_requests_2026-08-12.sql

Self-service staff registration: a stranger asked for an account, an admin
approved or rejected it, and approval created the `users` row. 8 rows.

Dropped on 2026-08-12 because nothing referenced it any more. The model in
`portal/models/registration_request.py` was the only thing left — no route, no
helper and no frontend call touched it, so the table could neither be written
to nor read through the application. The 24 `registration_request` rows in
`audit_logs` are from when the feature was live; they are left where they are,
because the audit trail records what happened and is not rewritten when a
feature goes away.

If self-registration comes back, this dump is the shape it had, including the
`requested_role` / `status` enums and the two indexes.
