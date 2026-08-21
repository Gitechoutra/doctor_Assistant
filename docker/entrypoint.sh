#!/bin/sh
# Backend container entrypoint.
#
# One job: do not start the app before MySQL will answer it. compose's
# `depends_on: condition: service_healthy` already waits for the server to
# accept connections, but the first boot of a fresh volume also has to import
# database/schema.sql, and portal/helpers/bootstrap runs its reconciliation
# (roles, the doctor's account, the formulary) during create_app(). Those
# checks swallow their own errors, so a database that is up but not yet
# populated produces a *silently* half-seeded start rather than a crash --
# the failure would only show up later as a sign-in that does not work.
#
# Nothing about the application is changed here: the command still comes from
# the image's CMD, which is the project's own `python app.py`.
set -e

host="${DB_HOST:-db}"
port="${DB_PORT:-3306}"
timeout="${DB_WAIT_TIMEOUT:-90}"

if [ -n "${DB_NAME:-}" ]; then
    echo "entrypoint: waiting for MySQL at ${host}:${port} (up to ${timeout}s)"

    waited=0
    until python - <<'PY' 2>/dev/null
import os
import sys

import pymysql

try:
    pymysql.connect(
        host=os.environ.get("DB_HOST", "db"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", ""),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", ""),
        connect_timeout=3,
    ).close()
except Exception:
    sys.exit(1)
PY
    do
        waited=$((waited + 2))
        if [ "$waited" -ge "$timeout" ]; then
            echo "entrypoint: MySQL did not answer within ${timeout}s -- starting anyway" >&2
            break
        fi
        sleep 2
    done

    [ "$waited" -lt "$timeout" ] && echo "entrypoint: MySQL is ready"
fi

exec "$@"
