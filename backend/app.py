"""Backend entry point.

`python app.py` starts the server (Socket.IO's runner, not plain WSGI, so
the consultation websocket works). The module-level `app` is also what the
Flask CLI auto-discovers, so `flask db upgrade` / `flask shell` work from
this directory with no FLASK_APP set.
"""

from portal import create_app
from portal.extensions import socketio

app = create_app()

if __name__ == "__main__":
    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=app.config["DEBUG"],
        allow_unsafe_werkzeug=True,
    )
