"""Push notifications for things that change the dashboard's numbers.

Every route that creates, starts, finishes or files something calls
`dashboard_changed` after its commit. The frontend refetches the summary on
that signal instead of waiting for a poll, so the cards stay honest while a
doctor watches them.

Emitted globally rather than per-room: the counts are scoped per viewer by
the summary endpoint anyway, and the payload carries no patient data — only
the reason it fired.
"""

from portal.extensions import socketio

DASHBOARD_EVENT = "dashboard_changed"
NURSING_EVENT = "nursing_changed"


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


def nursing_changed(reason, assignment_id=None):
    """Tells the nurse dashboard and the doctor's nursing monitor that a
    medication log, observation, note or alert has moved.

    Carries the assignment id so an open detail page can refetch only when the
    change was actually about the patient on screen. Kept separate from
    `dashboard_changed` because these fire far more often — a nurse logging
    doses all shift shouldn't make every doctor's summary cards refetch.
    """
    _emit(NURSING_EVENT, {"reason": reason, "assignment_id": assignment_id})
