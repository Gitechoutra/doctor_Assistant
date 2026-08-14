from flask_socketio import join_room

from portal.extensions import socketio


def consultation_room(consultation_id):
    return f"consultation_{consultation_id}"


@socketio.on("join_consultation")
def handle_join_consultation(data):
    consultation_id = data.get("consultation_id")
    if consultation_id:
        join_room(consultation_room(consultation_id))
