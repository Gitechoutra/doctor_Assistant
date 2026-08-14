"""Shared handling for user-uploaded images (profile pictures, patient photos).

Files are stored under uploads/<subdir> with a random name and served back
through a route that hands the directory to send_from_directory. The random
name is what keeps a URL unguessable — see serve_avatar in auth_routes for
why these images are served without a JWT.
"""

import os
import secrets

from flask import current_app, has_app_context

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2 MB

# Where uploads land when there's no app to ask -- a script or a shell. The
# configured UPLOAD_FOLDER defaults to this same path, so the two only differ
# once a deployment deliberately points storage somewhere else.
UPLOADS_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
)


def uploads_root():
    if has_app_context():
        return current_app.config.get("UPLOAD_FOLDER", UPLOADS_ROOT)
    return UPLOADS_ROOT


def upload_dir(subdir):
    return os.path.join(uploads_root(), subdir)


class ImageUploadError(Exception):
    """Rejected upload. `status` is the HTTP code the route should return."""

    def __init__(self, message, status=422):
        super().__init__(message)
        self.message = message
        self.status = status


def save_image(file_storage, subdir):
    """Validates and stores an uploaded image, returning its stored filename.

    Raises ImageUploadError with a caller-ready message and status.
    """
    if not file_storage or not file_storage.filename:
        raise ImageUploadError("An image file is required")

    extension = os.path.splitext(file_storage.filename)[1].lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_IMAGE_EXTENSIONS))
        raise ImageUploadError(f"Unsupported image type. Allowed: {allowed}")

    # werkzeug streams the upload to a temp file, so seek/tell is a cheap size
    # check that doesn't read the whole thing into memory.
    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size == 0:
        raise ImageUploadError("That image file is empty")
    if size > MAX_IMAGE_BYTES:
        raise ImageUploadError("Image must be 2 MB or smaller", status=413)

    directory = upload_dir(subdir)
    os.makedirs(directory, exist_ok=True)
    # Random filename, never the uploader's: it keeps the served URL
    # unguessable and sidesteps path traversal from a hostile name entirely.
    filename = f"{secrets.token_hex(16)}{extension}"
    file_storage.save(os.path.join(directory, filename))
    return filename


def delete_image(filename, subdir):
    """Removes a replaced image. Failure here must not fail the request — the
    DB row is already updated and a stray file is harmless."""
    if not filename:
        return
    try:
        os.remove(os.path.join(upload_dir(subdir), filename))
    except OSError:
        pass
