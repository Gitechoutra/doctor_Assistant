"""
portal/__init__.py
==================
Application factory.

`InitApp().app()` builds the Flask app: config, extensions, models, routes,
websocket handlers and error handlers, in that order. `create_app()` is the
public alias, and it is what `app.py`, `portal/seeds.py` and the Flask CLI
import -- keep it exported.
"""

import os

from flask import Flask

from config.config import get_config
from portal.extensions import cors, db, jwt, migrate, socketio
from portal.helpers.response import error
from portal.logger import configure_logger

# The most recently built app. Handy from a shell (`from portal import APP`),
# but deliberately not used as a cache: see InitApp.app for why.
APP = None


def init_cors(app):
    """Browser access is limited to the origins in CORS_ORIGINS, and only for
    /api/*. The uploads and socket routes are same-origin or token-free by
    design and don't need the header."""
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    app.logger.info("Initialized CORS for %s", app.config["CORS_ORIGINS"])


class InitApp:
    def app(self, config_name=None):
        """Builds and returns a fully wired Flask app.

        A fresh app every call, rather than caching one in the module-level
        APP: caching would pin the first config chosen for the process, which
        would make TestingConfig unusable from a test suite that also imports
        the app normally. Building is cheap; a wrong-config app is not.
        """
        global APP

        app = Flask(__name__)
        app.config.from_object(get_config(config_name))

        # -- Logging -------------------------------------------------------
        # Rotating file handler in logs/portal.log. Attached before anything
        # else so a failure during wiring below is actually recorded.
        configure_logger(app)
        app.logger.info(
            "Initializing portal -- environment: %s, debug: %s",
            app.config["ENV_NAME"],
            app.config["DEBUG"],
        )

        # -- Extensions ----------------------------------------------------
        db.init_app(app)
        migrate.init_app(app, db)
        jwt.init_app(app)
        init_cors(app)
        socketio.init_app(
            app,
            cors_allowed_origins=app.config["CORS_ORIGINS"],
            async_mode="threading",
        )

        # -- File storage --------------------------------------------------
        # Created up front so the first avatar upload isn't the thing that
        # discovers the directory is missing or unwritable.
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

        try:
            # Imported for the side effect of registering models on
            # db.metadata, which is what Flask-Migrate autogenerates from.
            from portal import models  # noqa: F401

            from portal.routes import register_routes

            register_routes(app)

            # Registers Socket.IO event handlers (join_consultation,
            # join_assignment, etc.) on the shared `socketio` instance.
            from portal.websocket import consultation_socket  # noqa: F401
            from portal.websocket import nursing_socket  # noqa: F401

        except Exception as exc:
            app.logger.exception("Failed to initialize app components: %s", exc)
            raise

        self._register_error_handlers(app)
        self._register_health(app)

        # -- Reference data ------------------------------------------------
        # What a database needs before anyone can use it: the roles the
        # authorization model is written against, an administrator to sign in
        # as, and the departments and formulary the clinical workflows assume.
        # Checked on every start rather than left to a migration or a seed
        # command, so a fresh clone or a restored dump comes up usable.
        #
        # All additive and non-fatal -- see helpers/bootstrap. Roles run first
        # because the admin account needs its role to exist.
        from portal.helpers.bootstrap import (
            ensure_admin,
            ensure_departments,
            ensure_medicines,
            ensure_roles,
            ensure_schema,
            ensure_usernames,
        )

        # First, and read-only: a database missing a column or an enum value
        # the models use fails at the statement, not at startup, so the checks
        # below would come up clean and the failure would surface later as a
        # 500 on whichever flow needed it. Reported, never applied -- see
        # ensure_schema.
        ensure_schema(app)
        ensure_roles(app)
        ensure_admin(app)
        # After the admin exists, so the account this check just created gets
        # a username in the same startup rather than the next one.
        ensure_usernames(app)
        ensure_departments(app)
        ensure_medicines(app)

        app.logger.info("Portal initialization completed successfully")

        APP = app
        return app

    @staticmethod
    def _register_error_handlers(app):
        """Every error leaves as the same JSON envelope the routes use, so a
        404 on a bad URL doesn't hand the frontend an HTML page it can't
        parse."""

        @app.errorhandler(404)
        def not_found(_e):
            return error("Resource not found", status=404)

        @app.errorhandler(413)
        def payload_too_large(_e):
            return error("That upload is too large", status=413)

        @app.errorhandler(500)
        def server_error(e):
            app.logger.exception(e)
            return error("Internal server error", status=500)

    @staticmethod
    def _register_health(app):
        @app.get("/api/health")
        def health():
            return {"status": "ok", "environment": app.config["ENV_NAME"]}


def create_app(config_name=None):
    """Public entry point. `app.py`, `portal/seeds.py` and the Flask CLI all
    import this name."""
    return InitApp().app(config_name)
