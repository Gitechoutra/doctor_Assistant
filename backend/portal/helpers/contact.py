"""How a phone number and an email address are checked, everywhere.

There are five doors an address or a number can come through -- Staff
the practice accounts, patient registration, the
profile screen and the sign-in form -- and each of them used to decide for
itself what "valid" meant. Two of them decided nothing at all. That is how a
staff directory ends up holding `+91 98765 43210` in one row and `9876543210`
in the next, and how an address with a typo'd domain gets an account whose
credentials email goes nowhere.

So the rules live here, once, and every route calls in:

  * `normalize_phone` -- exactly ten digits, or an error.
  * `normalize_email` -- a well-formed address at a domain the practice
    accepts, lowercased, or an error.

Both return `(value, error_message)` and both treat empty as "not given"
rather than as a failure. Whether blank is acceptable is the caller's
business: an optional patient phone and a required staff email both call the
same function, and each decides for itself what to do about `None`.
"""

import re

from flask import current_app

# -- Phone -------------------------------------------------------------------

# Exactly ten digits and nothing else -- no spaces, punctuation, country code
# or letters.
#
# Deliberately not a general international phone format: this is an Indian
# practice's records and every number in them is a ten-digit mobile. Widening
# it later means changing this constant and the matching hint in
# frontend/src/utils/contact.js, which is why the message spells the rule out
# rather than saying "invalid".
PHONE_DIGITS = 10

# `[0-9]`, not `\d`. Python's `\d` matches every Unicode decimal digit, so
# `\d{10}` happily accepts Devanagari "९८७६५४३२१०" -- ten characters that are
# digits by Unicode's definition and unusable as a phone number by anyone's.
# JavaScript's `\d` is ASCII-only, so the browser was already stripping them
# and only the server was wrong; this is exactly the kind of gap that makes
# server-side validation worth writing separately rather than assuming the
# form has already dealt with it.
PHONE_RE = re.compile(rf"^[0-9]{{{PHONE_DIGITS}}}$")

PHONE_ERROR = (
    f"Mobile number must be exactly {PHONE_DIGITS} digits, "
    "with no spaces, symbols or letters"
)


def normalize_phone(raw):
    """Returns (number, error_message).

    Empty comes back as (None, None) -- "no number on file" is a real state,
    and storing NULL for it rather than an empty string keeps it one value in
    the column instead of two. Anything else must be exactly ten digits: a
    half-typed number is not nearly valid, it is a number that reaches the
    wrong person.
    """
    if raw is None:
        return None, None
    value = str(raw).strip()
    if not value:
        return None, None
    if not PHONE_RE.match(value):
        return None, PHONE_ERROR
    return value, None


# -- Email -------------------------------------------------------------------

# Shape only: one @, something either side, a dot in the domain. Deliberately
# not an RFC 5322 parser -- the domain check below is what actually decides
# whether an address is acceptable here, and a regex that accepts every legal
# address and nothing else is famously not worth writing.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# The domains the practice accepts addresses at. Config overrides it
# (ALLOWED_EMAIL_DOMAINS, comma-separated) so a practice using its own domain
# does not need a code change, and `*` there turns the restriction off for a
# deployment that does not want it -- which most single practices will, since
# patients arrive with whatever address they already have.
#
# Mirrors EMAIL_DOMAINS in frontend/src/utils/contact.js -- keep the two in
# step. The browser copy only decides what to show; this one is the boundary.
DEFAULT_EMAIL_DOMAINS = ("gmail.com", "outlook.com")

# What to write in config to accept any domain.
ANY_DOMAIN = "*"


def allowed_email_domains():
    """The accepted domains, lowercased. Empty means every domain passes."""
    configured = current_app.config.get("ALLOWED_EMAIL_DOMAINS")
    if configured is None:
        return tuple(DEFAULT_EMAIL_DOMAINS)
    if isinstance(configured, str):
        configured = configured.split(",")
    domains = tuple(d.strip().lower().lstrip("@") for d in configured if d and d.strip())
    return () if ANY_DOMAIN in domains else domains


def email_domain_error(domains=None):
    """The message shown when the address is well-formed but the wrong domain.

    Names the acceptable domains rather than saying "invalid email": somebody
    typing a Yahoo address has not made a mistake they can see, and a message
    that does not say what is wanted leaves them guessing.
    """
    domains = domains if domains is not None else allowed_email_domains()
    listed = " or ".join(f"@{d}" for d in domains)
    return f"Email must be a {listed} address"


def normalize_email(raw):
    """Returns (address, error_message), lowercased.

    Empty comes back as (None, None); a caller that requires an address says
    so itself, because "required" differs per form -- a staff account cannot
    exist without one, a patient record happily can.
    """
    if raw is None:
        return None, None
    value = str(raw).strip().lower()
    if not value:
        return None, None
    if not EMAIL_RE.match(value):
        return None, "Enter a valid email address"

    domains = allowed_email_domains()
    if domains and value.rsplit("@", 1)[-1] not in domains:
        return None, email_domain_error(domains)
    return value, None


def looks_like_email(value):
    """Whether a sign-in identifier is an address rather than a username.

    The '@' is the whole test, matching `auth_routes._find_by_identifier`:
    usernames are generated from `[a-z0-9.]` and can never contain one. Kept
    here so the login form's validation and the lookup that follows it cannot
    disagree about which of the two the caller typed.
    """
    return "@" in (value or "")
