#!/bin/bash
# Creates the empty database the backend test suite points at, and nothing
# else. TestingConfig derives its name by suffixing the configured one with
# `_test` (config/config.py:_test_database_uri), so a run can never touch live
# records -- but the database itself has to exist first, and a container has
# no shell history where somebody once created it by hand.
#
# Runs once, on the first start of an empty data volume, after 10-schema.sql
# (the project's own database/schema.sql, bind-mounted read-only). It creates
# no tables -- the suite builds its own -- and it touches neither the
# application's schema nor its data.
#
# Two things about how it is written:
#
#   * The whole body is a subshell. MySQL's entrypoint *sources* an init
#     script that is not marked executable -- and a bind mount from Windows is
#     exactly the case where the executable bit does not survive. Sourced, a
#     bare `set -u` or a stray variable would leak into the entrypoint's own
#     shell and could break the rest of the initialisation. Nothing here
#     escapes the parentheses.
#   * The grant names whatever MYSQL_USER is configured rather than a
#     hardcoded username, which would abort the entire database initialisation
#     the moment somebody changed it in docker/.env.
(
    set -eo pipefail

    test_db="${MYSQL_DATABASE:-doctor}_test"

    sql="CREATE DATABASE IF NOT EXISTS \`${test_db}\`
           CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

    if [ -n "${MYSQL_USER}" ]; then
        sql="${sql}
          GRANT ALL PRIVILEGES ON \`${test_db}\`.* TO '${MYSQL_USER}'@'%';
          FLUSH PRIVILEGES;"
    fi

    echo "init: creating test database ${test_db}"
    printf '%s\n' "${sql}" | mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}"
)
