from urllib.parse import parse_qs, urlparse

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.auth_helper import get_current_doctor
from portal.helpers.response import error, success
from portal.models.emergency_case import EmergencyCase
from portal.models.notification import Notification

notification_bp = Blueprint("notifications", __name__)

DEFAULT_LIMIT = 20
MAX_LIMIT = 100

EMERGENCY_BOARD_PATH = "/dashboard/emergency"


def _emergency_case_for(notification):
    """The Emergency Case a notification is about, if any — looked up fresh on
    every read rather than frozen into the row when it was written.

    Two shapes reach the same case. An emergency notification carries the id
    outright (`/dashboard/emergency?case=12`, written by
    `emergency_routes.create_emergency_case`). A "patient assigned to you"
    link was written at registration, before any case could exist — a case can
    only be logged once the patient does — so it is matched back by patient
    instead. Re-checking on read is what lets an old notification heal itself
    the moment either becomes true.
    """
    parsed = urlparse(notification.link or "")

    if parsed.path.rstrip("/") == EMERGENCY_BOARD_PATH:
        raw_case_id = parse_qs(parsed.query).get("case", [None])[0]
        try:
            return EmergencyCase.query.get(int(raw_case_id))
        except (TypeError, ValueError):
            return None

    if notification.category == "patient_assignment":
        raw_patient_id = parse_qs(parsed.query).get("patient_id", [None])[0]
        try:
            patient_id = int(raw_patient_id)
        except (TypeError, ValueError):
            return None
        return (
            EmergencyCase.query.filter_by(patient_id=patient_id, status="waiting")
            .order_by(EmergencyCase.id.desc())
            .first()
        )

    return None


def _present(notification, is_doctor):
    """The notification as the bell menu and the Alerts page read it.

    `emergency_case` is the whole point of the claim-from-anywhere flow: an
    unclaimed case attached to this notification, small enough to draw a Claim
    button from without a second request. Present only while the case is
    actually still `waiting`, so the button disappears for everyone else the
    moment one doctor takes it, and only for doctors, because `POST
    /emergency/<id>/claim` refuses anybody else anyway.
    """
    data = notification.to_dict()

    case = _emergency_case_for(notification)
    if case and case.status == "waiting":
        # Whatever this row was written to point at, an unclaimed emergency
        # for the same patient is the more urgent destination.
        data["link"] = f"{EMERGENCY_BOARD_PATH}?case={case.id}"
        if is_doctor:
            data["emergency_case"] = {
                "id": case.id,
                "code": case.code,
                "patient": case.patient.name if case.patient else None,
                "patient_code": case.patient.code if case.patient else None,
                "severity": case.severity,
                "reason": case.reason,
            }

    return data


@notification_bp.get("")
@jwt_required()
def list_notifications():
    """The bell menu's only read: a page of the caller's own notifications
    plus the badge count, so opening it costs one request."""
    user_id = get_jwt_identity()

    limit = request.args.get("limit", type=int) or DEFAULT_LIMIT
    limit = max(1, min(limit, MAX_LIMIT))

    query = Notification.query.filter_by(user_id=user_id)
    if request.args.get("unread") == "true":
        query = query.filter_by(is_read=False)
    category = request.args.get("category")
    if category:
        query = query.filter_by(category=category)

    items = query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()

    # Resolved once for the page rather than per row — every row asks.
    is_doctor = get_current_doctor() is not None
    item_dicts = [_present(n, is_doctor) for n in items]

    return success({"items": item_dicts, "unread_count": unread_count})


@notification_bp.post("/<int:notification_id>/read")
@jwt_required()
def mark_read(notification_id):
    user_id = get_jwt_identity()
    notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not notification:
        # Scoped by user_id above, so someone else's id reads as "not found"
        # rather than confirming it exists.
        return error("Notification not found", status=404)

    notification.is_read = True
    db.session.commit()

    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    data = _present(notification, get_current_doctor() is not None)
    return success({"notification": data, "unread_count": unread_count})


@notification_bp.post("/read-all")
@jwt_required()
def mark_all_read():
    user_id = get_jwt_identity()
    updated = (
        Notification.query.filter_by(user_id=user_id, is_read=False)
        .update({"is_read": True}, synchronize_session=False)
    )
    db.session.commit()
    return success({"updated": updated, "unread_count": 0}, message="All notifications marked read")
