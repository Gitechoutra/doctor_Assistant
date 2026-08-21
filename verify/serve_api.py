"""Start the API on a port the verification run has confirmed is free.

The same `create_app()` and the same Socket.IO runner `app.py` uses -- this
is the application under test, not a stand-in for it. Only the port differs,
and it differs for a reason:

`app.py` binds 5000. On this machine another application binds 5000 too, and
Windows lets both succeed without either reporting the port as taken.
Whichever bound last serves the connections, so a verification run against
5000 may be testing somebody else's API. Every `/api/*` call then 404s, which
looks exactly like a broken frontend -- empty lists, blank panels -- and the
run would report a pile of bugs that are not in this codebase at all.

Reading PORT from the environment lets `verify/run.py` pick a port it has
just bound and released, and lets CI pick one too.
"""

import os
import sys

# Python puts *this* file's directory on sys.path, not the working directory,
# so `portal` is not importable from here no matter where the process was
# started. backend/ goes on the path explicitly.
sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
)

from portal import create_app  # noqa: E402
from portal.extensions import db, socketio  # noqa: E402

app = create_app()

# Under the testing config the schema may not exist yet. `create_all` is
# additive and never drops, so a database the suites have already populated
# keeps its rows -- which is what gives the browser pass real screens to
# render instead of a set of empty states.
if os.environ.get("APP_ENV") == "testing":
    with app.app_context():
        db.create_all()
    app = create_app()  # rebuild so bootstrap seeds into the tables now present

if __name__ == "__main__":
    socketio.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("PORT", "5001")),
        debug=False,          # no reloader: a second process would race the port
        allow_unsafe_werkzeug=True,
    )
