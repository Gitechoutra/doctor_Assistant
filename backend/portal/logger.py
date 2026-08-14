import logging
import os
from logging.handlers import RotatingFileHandler

LOG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "logs"))


def configure_logger(app):
    os.makedirs(LOG_DIR, exist_ok=True)

    handler = RotatingFileHandler(
        os.path.join(LOG_DIR, "portal.log"), maxBytes=1_000_000, backupCount=5
    )
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    )
    handler.setFormatter(formatter)
    handler.setLevel(logging.INFO)

    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
    return app.logger
