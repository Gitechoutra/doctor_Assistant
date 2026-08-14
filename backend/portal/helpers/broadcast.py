"""Push notifications for things that change the dashboard's numbers.

Every route that creates, starts, finishes or files something calls
`dashboard_changed` after its commit. Both clients refetch the summary on that
signal instead of waiting for a poll, which is what keeps the PA's queue board
and the doctor's queue showing the same thing at the same moment: the doctor
calls a patient in, and the number on the desk's screen moves without anybody
pressing refresh.

Emitted globally rather than per-room: the counts are scoped per viewer by the
summary endpoint anyway, and the payload carries no patient data — only the
reason it fired.
"""

from portal.extensions import socketio

DASHBOARD_EVENT = "dashboard_changed"


def _emit(event, payload):
    """Never lets a broadcast failure break the request that triggered it —
    the real work is already committed, and a missed ping only costs the
    client its next poll."""
    try:
        socketio.emit(event, payload)
    except Exception:  # noqa: BLE001 - a dropped notification must not 500 the caller
        pass


def dashboard_changed(reason):
    """Tells connected clients their dashboard counts may be stale."""
    _emit(DASHBOARD_EVENT, {"reason": reason})
