from flask_jwt_extended import get_jwt_identity

from portal.models.doctor import Doctor


def get_current_doctor():
    """The Doctor row for the authenticated user, or None.

    None means the caller is the PA. Every scoping helper reads it that way --
    a caller with no doctor profile is the desk, and sees the practice's whole
    list rather than one doctor's slice of it.
    """
    user_id = get_jwt_identity()
    return Doctor.query.filter_by(user_id=user_id).first()
