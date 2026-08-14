"""Creating in-app notifications.

Call `notify(...)` from a route right before its `db.session.commit()` — the
rows are added to the open session, so a notification can never outlive the
event that triggered it (a failed commit rolls both back together).
"""

from portal.extensions import db
from portal.models.notification import Notification
from portal.models.role import Role
from portal.models.user import User


def notify(user_ids, title, body=None, category="system", link=None, exclude_user_id=None):
    """Queues one notification per user id. Returns how many were queued.

    `exclude_user_id` drops the person who caused the event — nobody needs to
    be told about something they just did themselves.
    """
    try:
        exclude_user_id = int(exclude_user_id) if exclude_user_id is not None else None
    except (TypeError, ValueError):
        exclude_user_id = None

    targets = {int(uid) for uid in user_ids if uid is not None}
    targets.discard(exclude_user_id)

    for user_id in targets:
        db.session.add(
            Notification(
                user_id=user_id,
                category=category,
                title=title,
                body=body,
                link=link,
            )
        )
    return len(targets)


def role_user_ids(*role_names):
    """User ids of every active user holding one of the given roles."""
    rows = (
        db.session.query(User.id)
        .join(Role, User.role_id == Role.id)
        .filter(Role.name.in_(role_names), User.is_active.is_(True))
        .all()
    )
    return [r[0] for r in rows]
