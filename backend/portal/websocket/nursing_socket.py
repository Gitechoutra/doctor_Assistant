"""Live delivery for the doctor/nurse conversation about one patient.

A room per assignment, so a message reaches the two people looking at that
patient's record and nobody else. The broader `nursing_changed` broadcast
still fires for list screens that only need to know something moved -- this
room is for the thread itself, where latency is the whole point.
"""

from flask_socketio import join_room, leave_room

from portal.extensions import socketio

CARE_MESSAGE_EVENT = "care_message"


def assignment_room(assignment_id):
    return f"nursing_assignment_{assignment_id}"


@socketio.on("join_assignment")
def handle_join_assignment(data):
    assignment_id = (data or {}).get("assignment_id")
    if assignment_id:
        join_room(assignment_room(assignment_id))


@socketio.on("leave_assignment")
def handle_leave_assignment(data):
    assignment_id = (data or {}).get("assignment_id")
    if assignment_id:
        leave_room(assignment_room(assignment_id))


def emit_care_message(assignment_id, payload):
    """Pushes a new message to whoever has that patient's record open.

    Failure is swallowed for the same reason as the other broadcasts: the
    message is already committed, and a dropped push only costs the client its
    next poll.
    """
    try:
        socketio.emit(CARE_MESSAGE_EVENT, payload, room=assignment_room(assignment_id))
    except Exception:  # noqa: BLE001 - a dropped push must not 500 the sender
        pass
