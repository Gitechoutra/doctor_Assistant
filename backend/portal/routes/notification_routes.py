"""The bell menu.

Deliberately thin. The hospital version presented each notification through a
resolver that looked up whatever emergency case it might be about and rewrote
the link on the way out — a practice has no emergency board, so a notification
now says what it said when it was written and links where it linked.
"""

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.response import error, success
from portal.models.notification import Notification

notification_bp = Blueprint("notifications", __name__)

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


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

    items = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .all()
    )
    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()

    return success({"items": [n.to_dict() for n in items], "unread_count": unread_count})


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
    return success({"notification": notification.to_dict(), "unread_count": unread_count})


@notification_bp.post("/read-all")
@jwt_required()
def mark_all_read():
    user_id = get_jwt_identity()
    updated = Notification.query.filter_by(user_id=user_id, is_read=False).update(
        {"is_read": True}, synchronize_session=False
    )
    db.session.commit()
    return success(
        {"updated": updated, "unread_count": 0}, message="All notifications marked read"
    )
