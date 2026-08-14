"""Issuing a staff account's sign-in credentials.

Everything somebody used to type by hand and no longer does: the
username, the first password, and the single-use link that replaces it.

The rule the whole module exists to hold: **nobody but the staff member ever
knows their password.** A role and a name are chosen; the account's
username is derived from that name, its first password is random and short-lived
in practice, and the only way to set a lasting one is the link emailed to the
staff member's own address. That is why `generate_temp_password` returns a value
the caller is expected to hand straight to `helpers/email` and then drop, and
why nothing here writes a password anywhere but `users.password_hash`.

Three pieces:

  * `unique_username` / `assign_username` -- sandeep.viswanadh, and the
    numbering that keeps it unique.
  * `generate_temp_password` -- what the credentials email carries.
  * `issue_link` -- the token behind the reset URL, and `consume_link`, which
    spends it.
"""

import hashlib
import re
import secrets
import unicodedata

from flask import current_app

from portal.extensions import db
from portal.models.password_reset_token import PasswordResetToken
from portal.models.user import User

# The shortest password the portal accepts, wherever one is set: the staff
# form used to own this number, but nobody types a
# password at all, so it now belongs with everything else about credentials.
# Both places a password can now be chosen -- the reset link and the
# signed-in change-password form -- check against this one value.
MIN_PASSWORD = 8

# -- Usernames ---------------------------------------------------------------

# Titles typed as part of a name and never meant as part of
# the login. "Dr. Sandeep Viswanadh" is how the staff list reads and
# `sandeep.viswanadh` is who signs in -- `dr.sandeep.viswanadh` would be neither.
#
# Stripped only from the front, and only when the rest of the name survives:
# a staff member recorded as just "Dr" keeps it rather than ending up with a
# username derived from nothing.
HONORIFICS = {
    "dr", "dr.", "doctor",
    "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss",
    "sr", "sr.", "sister", "prof", "prof.", "professor",
}

# Room for the numeric suffix inside users.username (150), with a length that
# still fits a sign-in field and a printed staff list.
MAX_USERNAME_BASE = 60

# What survives into a username. Everything else becomes a separator, so
# "Anita  O'Brien-Sharma" is anita.o.brien.sharma rather than a string with an
# apostrophe in it that half the systems downstream will quote wrongly.
_ALLOWED = re.compile(r"[^a-z0-9]+")

# Used to hand a name back to the pool of candidates when the person's name
# transliterates to nothing at all (a record written entirely in Telugu, say).
FALLBACK_USERNAME = "staff"


def _asciify(text):
    """Latin-ish text with its accents removed; anything else dropped.

    NFKD splits "é" into "e" + a combining accent, and the accent is discarded
    as a non-ASCII byte. A name in a non-Latin script survives this with
    nothing left, which is what the fallbacks in `username_base` are for.
    """
    decomposed = unicodedata.normalize("NFKD", text or "")
    return decomposed.encode("ascii", "ignore").decode("ascii")


def username_base(name, email=None):
    """The username somebody's name asks for, before uniqueness is considered.

        Sandeep Viswanadh   -> sandeep.viswanadh
        Dr. Fatima Begum    -> fatima.begum
        Anita O'Brien       -> anita.o.brien

    Falls back to the local part of the email, then to a constant, so this
    always returns something usable -- a name the transliteration cannot
    represent must still produce an account somebody can sign in to.
    """
    words = [w for w in _asciify(name).strip().split() if w]
    # Only if dropping the title leaves a name behind.
    while len(words) > 1 and words[0].lower() in HONORIFICS:
        words.pop(0)

    slug = _ALLOWED.sub(".", ".".join(words).lower()).strip(".")
    # "a..b" out of "A - B". One dot reads as a separator; two read as a typo.
    slug = re.sub(r"\.{2,}", ".", slug)

    if not slug and email:
        slug = _ALLOWED.sub(".", _asciify(email).split("@")[0].lower()).strip(".")
        slug = re.sub(r"\.{2,}", ".", slug)

    return (slug or FALLBACK_USERNAME)[:MAX_USERNAME_BASE].strip(".")


def greeting_name(name):
    """What to put after "Hello" in an email.

        Dr. Sandeep Viswanadh  -> Dr. Sandeep
        Sr. Fatima Begum       -> Sr. Fatima
        Anita Sharma           -> Anita

    The title is kept here, unlike in a username, because this is a greeting
    and dropping it is a small rudeness to the person being greeted. Taking
    the first word alone is the thing to avoid: it addresses a consultant as
    "Hello Dr.,".
    """
    words = (name or "").split()
    if not words:
        return "there"
    if len(words) > 1 and words[0].lower() in HONORIFICS:
        return f"{words[0]} {words[1]}"
    return words[0]


def unique_username(name, email=None, *, exclude_user_id=None):
    """`username_base`, with a number appended until nothing else holds it.

        sandeep.viswanadh, sandeep.viswanadh1, sandeep.viswanadh2, ...

    Every candidate is checked against the database in one query rather than
    one per attempt: eleven people called Sunil Kumar would otherwise cost
    eleven round trips to find that out.

    Compared case-insensitively even though MySQL's default collation already
    is -- the rule is a property of usernames here, not of whichever database
    this happens to run on, and SQLite (used by a test run) would disagree.
    """
    base = username_base(name, email)

    query = db.session.query(User.username).filter(
        User.username.isnot(None),
        # `base` is [a-z0-9.] only, so there is no LIKE wildcard to escape.
        User.username.ilike(f"{base}%"),
    )
    if exclude_user_id:
        query = query.filter(User.id != exclude_user_id)

    taken = {row[0].lower() for row in query.all() if row[0]}

    if base not in taken:
        return base

    # Bounded by how many rows could possibly be in the way, so this cannot
    # spin: `taken` has a finite size and one of the first len(taken) + 1
    # candidates is necessarily free.
    for suffix in range(1, len(taken) + 2):
        candidate = f"{base}{suffix}"
        if candidate.lower() not in taken:
            return candidate

    # Unreachable by the argument above; a random tail beats raising here,
    # since the unique index is the real guarantee either way.
    return f"{base}{secrets.randbelow(9000) + 1000}"


def assign_username(user, *, force=False):
    """Gives `user` a username if it hasn't got one. Returns it.

    Called wherever an account is created -- Staff Management, the older
    the account seeder, and the startup backfill in helpers/bootstrap --
    so that "every account has a username" is true regardless of which door
    the account came through.
    """
    if user.username and not force:
        return user.username
    user.username = unique_username(user.name, user.email, exclude_user_id=user.id)
    return user.username


# -- Temporary passwords -----------------------------------------------------

# No O/0, I/l/1 or 5/S. This is transcribed by hand from an email into a login
# form, often from a phone, and a password that is only wrong because of the
# font it was read in produces a support call, not a security benefit.
_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZabcdefghijkmnpqrstuvwxyz2346789"
TEMP_PASSWORD_LENGTH = 12


def generate_temp_password(length=TEMP_PASSWORD_LENGTH):
    """A random first password, drawn from `secrets`.

    Twelve characters of a 53-character alphabet is roughly 68 bits, which is
    far past anything that matters for a credential meant to be replaced on
    first sign-in. Length rather than punctuation does that work here, for the
    transcription reason above.
    """
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(max(8, length)))


# -- Reset links -------------------------------------------------------------

# 32 bytes -> 43 URL-safe characters. Long enough that guessing is not a
# strategy, short enough that the link survives an email client's line wrapping.
TOKEN_BYTES = 32


def hash_token(raw_token):
    """The value stored in `password_reset_tokens.token_hash`.

    Plain SHA-256, deliberately: unlike a password this is 256 bits of
    `secrets` output, so there is nothing for a slow KDF to protect -- and
    hashing is on the path of every click of every reset link.
    """
    return hashlib.sha256((raw_token or "").encode("utf-8")).hexdigest()


def link_lifetime_minutes(purpose):
    """How long a link of this kind lasts, from config."""
    if purpose == "invite":
        return current_app.config.get("INVITE_TOKEN_HOURS", 72) * 60
    return current_app.config.get("RESET_TOKEN_MINUTES", 60)


def issue_link(user, *, purpose="reset", issued_by_id=None):
    """Mints a single-use password link for `user`.

    Returns `(raw_token, url)`. The row joins the caller's open session and is
    committed with it, matching how `helpers/audit` and `helpers/notify` work:
    a link can never outlive the account creation that triggered it.

    The account's earlier unused links are deleted first, so reissuing
    genuinely supersedes -- somebody resending credentials because
    the first email went astray must not leave two live ways in. Spent links
    are left alone: "you have already used this link" stays answerable.
    """
    PasswordResetToken.query.filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).delete(synchronize_session=False)

    raw_token = secrets.token_urlsafe(TOKEN_BYTES)
    db.session.add(
        PasswordResetToken.issue(
            user.id,
            hash_token(raw_token),
            purpose=purpose,
            minutes=link_lifetime_minutes(purpose),
            issued_by_id=issued_by_id,
        )
    )
    return raw_token, reset_url(raw_token)


def reset_url(raw_token):
    """Where the recipient lands. A frontend route, not an API one -- the link
    has to open a form, and PORTAL_BASE_URL is what the letterhead and the
    rest of the outbound links already use."""
    base = current_app.config.get("PORTAL_BASE_URL", "").rstrip("/")
    return f"{base}/reset-password?token={raw_token}"


def login_url():
    base = current_app.config.get("PORTAL_BASE_URL", "").rstrip("/")
    return f"{base}/login"


def find_link(raw_token):
    """The token row for a raw token, or None. Says nothing about validity --
    callers need to tell "expired" and "already used" apart for the message
    they show, so `is_usable` is checked at the call site."""
    if not raw_token or not isinstance(raw_token, str):
        return None
    return PasswordResetToken.query.filter_by(token_hash=hash_token(raw_token)).first()
