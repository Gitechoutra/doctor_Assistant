"""Reconciliation that runs every time the app starts.

What a MediAssist AI database has to have before anybody can do anything, and
all of it otherwise a command somebody has to remember to run:

  * **the roles.** `users.role_id` is NOT NULL and several routes look a role
    up by name, so a database restored from an older dump comes up broken with
    no symptom until a sign-in fails.
  * **the doctor's account.** Somebody who clones this and runs `python app.py`
    would otherwise have a working server and no way to sign in to it. Only
    the doctor: the desk's PA accounts are created from inside the application
    by the doctor, each with credentials of their own.
  * **the formulary and the prescribing catalogue.** An empty `medicines`
    table makes every line of every AI-suggested prescription come back
    flagged off-formulary; an empty `medicine_brands` table is a prescription
    picker with nothing in it. Neither fails loudly — they show up later as an
    odd-looking prescription, or as a doctor hand-typing every line.

Doing all of it at boot removes that class of problem: whatever `python app.py`
is pointed at, the roles exist, there are accounts to sign in with, and the
reference data the workflows assume is there by the time it serves a request.

Every check is *additive*. Nothing here renames, overwrites or deletes a row
that already exists — a practice's own medicine edits survive every restart
untouched. The one exception is deliberate and documented: the configured
doctor account is brought back in step with its seed credentials, which is how
a changed email or password takes effect (see `seeders/seed_accounts`).
"""

from sqlalchemy import Enum, inspect

from portal.extensions import db
from portal.models.medicine import DEFAULT_FORMULARY, Medicine
from portal.models.medicine_brand import MedicineBrand
from portal.models.role import DEFAULT_ROLES, Role
from portal.models.user import User


def _guarded(app, model, label, work):
    """Runs one reconciliation with the guarantees every check here shares.

    Skips quietly when the table does not exist yet — `flask db upgrade`
    imports this same factory, so querying blindly would break the migration
    that creates it — and never raises, because startup failing over a
    transient database problem is worse than starting and reporting it per
    request.

    `work` returns the list of names it added, for the log line.
    """
    try:
        with app.app_context():
            if not inspect(db.engine).has_table(model.__tablename__):
                app.logger.info(
                    "%s check: '%s' table does not exist yet -- run "
                    "'flask db upgrade' first. Skipping.",
                    label,
                    model.__tablename__,
                )
                return []
            return work()
    except Exception as exc:  # noqa: BLE001 - see the docstring
        # rollback so a half-applied insert cannot poison the next session
        # that picks this connection up.
        try:
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        app.logger.warning("Could not verify %s at startup: %s", label.lower(), exc)
        return []


def _report(app, label, added, total):
    if added:
        app.logger.info(
            "%s check: added %d missing -- %s", label, len(added), ", ".join(added)
        )
    else:
        app.logger.info("%s check: all %d present", label, total)
    return added


def ensure_schema(app):
    """Reports where the live database disagrees with the models. Read-only.

    The one check here that changes nothing, because it cannot: adding a
    column or widening an enum on a live table is a decision with data
    behind it, and a server that quietly reshapes the schema it was pointed
    at is worse than one that says what is wrong. It writes a warning and a
    dated `.sql` in `database/changes/` is what actually applies the fix.

    It exists because the symptom of drift is unreadable at the point it
    bites. A missing column is a 1054 on every query that touches the table;
    a missing enum value is a 1265 on one INSERT deep inside a transaction,
    which rolls the whole thing back — the front desk sees "Could not create
    this OP" and there is nothing wrong with anything they did. Both of those
    shipped: `notifications.category` never gained `patient_assignment`, so
    registering a patient failed at the notification and took the patient and
    their OP down with it.

    Nothing catches that earlier. There is no Alembic chain in this checkout
    (see `database/changes/README.md`), the change scripts are applied by
    hand, and a schema one ALTER behind starts, connects, serves the login
    page and fails only on the flow that needed the missing piece. Two lines
    in the startup log turn a support ticket into a script somebody runs.

    Enum values and columns only: the mismatches that make a statement fail
    outright. Types, lengths, defaults and indexes drift in ways MySQL
    tolerates, and reporting those would bury the two that don't.
    """
    try:
        with app.app_context():
            insp = inspect(db.engine)
            live_tables = set(insp.get_table_names())
            if not live_tables:
                app.logger.info(
                    "Schema check: the database is empty -- nothing to compare yet."
                )
                return []

            problems = []
            for table in db.metadata.sorted_tables:
                if table.name not in live_tables:
                    problems.append(f"missing table '{table.name}'")
                    continue
                live_columns = {c["name"]: c for c in insp.get_columns(table.name)}
                for column in table.columns:
                    live = live_columns.get(column.name)
                    if live is None:
                        problems.append(f"{table.name}.{column.name} is missing")
                        continue
                    if isinstance(column.type, Enum):
                        # Only values the models have and the column lacks. The
                        # other direction is a value being retired, which every
                        # existing row still reads back fine.
                        absent = set(column.type.enums) - set(
                            getattr(live["type"], "enums", None) or []
                        )
                        if absent:
                            problems.append(
                                f"{table.name}.{column.name} accepts no "
                                f"{', '.join(sorted(absent))}"
                            )

            if not problems:
                app.logger.info(
                    "Schema check: all %d tables match the models",
                    len(db.metadata.sorted_tables),
                )
                return []

            app.logger.warning(
                "Schema check: the database is behind the models -- %s. Apply the "
                "pending scripts in database/changes/ (see its README); until then "
                "any request touching these will fail.",
                "; ".join(problems),
            )
            return problems

    except Exception as exc:  # noqa: BLE001 - see the module docstring
        app.logger.warning("Could not verify the schema at startup: %s", exc)
        return []


def ensure_medicine_brands(app):
    """Inserts any prescribing-catalogue entry the database is missing.

    Reconciled at boot rather than left to a seed command, unlike the hospital
    version where this was the pharmacy's own starting inventory. Here it is
    what the prescription picker draws from, and an empty table is not a
    cosmetic gap -- it is a doctor hand-typing every line of every
    prescription. A practice that has never run a seed command still gets a
    working formulary.

    Matched on (brand_name, strength), the table's own unique pair, and only
    ever inserted: a brand somebody has edited keeps their edit.
    """
    from portal.seeders.seed_medicines import MEDICINE_BRANDS, seed_medicine_brands

    def work():
        created = seed_medicine_brands()
        return _report(app, "Prescribing catalogue", created, len(MEDICINE_BRANDS))

    return _guarded(app, MedicineBrand, "Prescribing catalogue", work)


def ensure_medicines(app):
    """Inserts any of DEFAULT_FORMULARY the database is missing.

    Matched on name. `medicines.name` has no unique constraint — two strengths
    of the same drug are a legitimate pair of rows — so this comparison is the
    only thing standing between a restart and a duplicated formulary.

    An entry already on file keeps its category, dose and frequency. Those are
    clinical defaults somebody may have tuned; a restart must not reset them.
    """

    def work():
        existing = {name for (name,) in db.session.query(Medicine.name).all()}
        missing = [row for row in DEFAULT_FORMULARY if row[0] not in existing]
        for name, category, dose, frequency in missing:
            db.session.add(
                Medicine(
                    name=name,
                    category=category,
                    default_dose=dose,
                    default_frequency=frequency,
                )
            )
        if missing:
            db.session.commit()
        return _report(
            app, "Medicine", [r[0] for r in missing], len(DEFAULT_FORMULARY)
        )

    return _guarded(app, Medicine, "Medicine", work)


def ensure_roles(app):
    """Inserts any of DEFAULT_ROLES that the database is missing.

    Additive only. An existing role is left exactly as it is — including its
    description, which may have been edited deliberately, and
    which the seeder is the right place to refresh in bulk.

    Never raises. Startup failing because of a transient database problem is
    strictly worse than starting and reporting the problem per request: the
    app is already built at this point, and every route surfaces a database
    outage on its own.
    """
    try:
        with app.app_context():
            # A fresh database has no tables until `flask db upgrade` runs —
            # and that command imports this same factory, so querying blindly
            # here would break the very migration that creates the table.
            if not inspect(db.engine).has_table(Role.__tablename__):
                app.logger.info(
                    "Roles table does not exist yet -- run 'flask db upgrade' first. "
                    "Skipping the role check."
                )
                return []

            existing = {name for (name,) in db.session.query(Role.name).all()}
            missing = [(n, d) for n, d in DEFAULT_ROLES if n not in existing]

            if not missing:
                app.logger.info(
                    "Role check: all %d roles present (%s)",
                    len(DEFAULT_ROLES),
                    ", ".join(name for name, _ in DEFAULT_ROLES),
                )
                return []

            for name, description in missing:
                db.session.add(Role(name=name, description=description))
            db.session.commit()

            added = [name for name, _ in missing]
            app.logger.info(
                "Role check: added %d missing role%s -- %s",
                len(added),
                "" if len(added) == 1 else "s",
                ", ".join(added),
            )
            return added

    except Exception as exc:  # noqa: BLE001 - see the docstring
        # rollback so a half-applied insert cannot poison the next session
        # that picks this connection up.
        try:
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        app.logger.warning("Could not verify the roles table at startup: %s", exc)
        return []


def ensure_usernames(app):
    """Gives a username to any account that hasn't got one.

    Accounts arrive by more doors than Staff Management: the demo seeder, the
    the account seeder, and every row that existed before usernames did.
    Rather than teach each of them separately,
    the invariant is restored here on every start — one place, and one that a
    restored dump passes through too.

    Sign-in accepts an email address as well, so a missing username is not an
    outage; it is a staff member who cannot be told "your username is …",
    which is exactly what the credentials email says.

    Additive like everything else here: an existing username is never
    rewritten, because it is what the person types every morning.
    """
    from portal.helpers.credentials import assign_username

    def work():
        pending = User.query.filter(
            db.or_(User.username.is_(None), User.username == "")
        ).all()
        named = []
        for user in pending:
            # One at a time and flushed as we go: `assign_username` reads the
            # usernames already taken, and two new joiners called Sunil Kumar
            # in the same backfill must not both be handed `sunil.kumar`.
            named.append(f"{user.name} -> {assign_username(user, force=True)}")
            db.session.flush()
        if named:
            db.session.commit()
        return _report(app, "Username", named, User.query.count())

    return _guarded(app, User, "Username", work)


def ensure_accounts(app):
    """Creates the doctor's account, or rewrites it to match the configured
    credentials.

    Returns the roles it created accounts for. Same contract as
    `ensure_roles`: idempotent, and never raises.

    **The doctor only.** There is no default PA: the desk's accounts are
    created by the doctor through "Assistants" (`routes/pa_routes`), which
    issues each assistant credentials of their own. So a fresh database comes
    up with a doctor to sign in as — the one account without which nobody can
    reach the application at all — and the practice adds its own people from
    inside it.

    The doctor's `doctors` profile row is created with the account, because a
    doctor without one is invisible to `helpers/practice.practice_doctor` and
    nothing can be booked against them.

    Note what this does *not* do: it never creates a second account beside one
    whose credentials have changed. Restarting the server after changing the
    configured email must leave you with one doctor, moved — not two, the
    second holding a password that is published in the repository.

    The actual work is `seeders/seed_accounts.ensure_account`, so that rule and
    the credentials are defined once and behave identically whether they arrive
    via `python app.py` or `python -m portal.seeds`. That is also where the
    `SEED_ACCOUNT_SYNC=false` opt-out is documented, for deployments that want
    the account left alone once it exists.

    Must run after `ensure_roles` — an account needs its role to exist.
    """
    # Imported here rather than at module scope: helpers are imported early in
    # the app factory, and reaching into a seeder at that point would pull the
    # models in before they are registered.
    from portal.models.role import DOCTOR, role_label
    from portal.seeders.seed_accounts import account_credentials, ensure_account

    created = []
    try:
        with app.app_context():
            for table in (Role.__tablename__, User.__tablename__):
                if not inspect(db.engine).has_table(table):
                    app.logger.info(
                        "Account check: '%s' table does not exist yet. Skipping.",
                        table,
                    )
                    return []

            for role_name in (DOCTOR,):
                label = role_label(role_name)
                _n, _e, _p, is_default_password = account_credentials(role_name)
                user, was_created, changes = ensure_account(role_name)

                if was_created:
                    created.append(role_name)
                    app.logger.info(
                        "Account check: created the %s account -- %s", label, user.email
                    )
                    if is_default_password:
                        app.logger.warning(
                            "That %s account uses the default password. Set "
                            "SEED_%s_PASSWORD, or change it after the first sign-in.",
                            label,
                            label.upper(),
                        )
                elif changes:
                    app.logger.info(
                        "Account check: updated the %s account (%s) from the "
                        "configured credentials -- %s",
                        label,
                        user.email,
                        ", ".join(changes),
                    )
                else:
                    # The account's own address and username -- not the
                    # configured ones. With syncing off the two can differ, and
                    # logging the configured value would imply the check had
                    # touched the account.
                    #
                    # Both identifiers, because login accepts either and "I
                    # cannot sign in" is nearly always someone typing an address
                    # the account no longer has. One line in the startup log
                    # answers it without opening the database.
                    app.logger.info(
                        "Account check: the %s account already exists -- left "
                        "untouched. Signs in as '%s' or %s",
                        label,
                        user.username or "(no username yet)",
                        user.email,
                    )

                if not user.is_active:
                    app.logger.warning(
                        "The %s account (%s) is disabled. No replacement has been "
                        "created -- re-enable it in the database if you are locked out.",
                        label,
                        user.email,
                    )
            return created

    except Exception as exc:  # noqa: BLE001 - startup must not die over this
        try:
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        app.logger.warning("Could not verify the practice accounts at startup: %s", exc)
        return created
