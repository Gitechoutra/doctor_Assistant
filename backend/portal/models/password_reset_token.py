"""Single-use links that let somebody set their own password.

Two things issue one, and they differ only in how long it lasts and what the
email around it says:

  * **invite** -- an administrator created the account in Staff Management.
    The same message carries a temporary password, so the staff member can
    sign in either way; the link is the one that leaves the hospital with no
    copy of what they chose.
  * **reset** -- the staff member pressed "forgot password" themselves.

What is stored is the SHA-256 of the token, never the token. The value that
travels in the email is 43 URL-safe characters from `secrets`, and it exists
in exactly one place after that: the recipient's inbox. A stolen database
backup therefore yields no usable link, which is the whole reason this is a
separate table rather than a nullable column on `users`.

Single use is enforced by `used_at`, not by deleting the row -- "this link was
already used, at 09:14" is a materially different answer to give somebody than
"this link is not valid", and the audit trail wants both.
"""

from datetime import datetime, timedelta

from portal.extensions import db

# What issued the token. Only ever these two -- see the module docstring.
PURPOSES = ("invite", "reset")


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # SHA-256 hex of the token in the email. Unique so a lookup is a single
    # indexed read and a collision is a database error rather than two
    # accounts sharing a link.
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    purpose = db.Column(
        db.Enum(*PURPOSES, name="reset_token_purpose"),
        nullable=False,
        default="reset",
    )
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)
    # Who caused it to be issued: the administrator for an invite, nobody for
    # a self-service reset (that route is unauthenticated by necessity).
    issued_by_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = db.Column(db.TIMESTAMP, server_default=db.func.now(), default=datetime.utcnow)

    user = db.relationship("User", foreign_keys=[user_id], backref=db.backref(
        "reset_tokens", cascade="all, delete-orphan", passive_deletes=True
    ))

    __table_args__ = (
        # Covers "this account's links that have not been spent" --
        # `helpers/credentials.issue_link` filters on exactly (user_id,
        # used_at IS NULL) before superseding them.
        #
        # Created by migration b8f3c21d90ae but never declared here, which made
        # every `flask db migrate` propose dropping it: autogenerate compares
        # the database against the models, and an index only one side knows
        # about reads as one to remove. Declaring it is what makes the two
        # agree -- the same fix, for the same reason, as `retired_at` on
        # `clinical_precedents`.
        db.Index("idx_reset_token_user", "user_id", "used_at"),
    )

    @property
    def is_expired(self):
        # utcnow, matching how expires_at was written. Everything else in this
        # codebase stores naive UTC (see helpers/datetime_helper), and mixing
        # an aware `now` in here would raise rather than compare.
        return datetime.utcnow() >= self.expires_at

    @property
    def is_usable(self):
        return self.used_at is None and not self.is_expired

    @classmethod
    def issue(cls, user_id, token_hash, *, purpose="reset", minutes=60, issued_by_id=None):
        """Builds a token row. The caller adds it to the session.

        Deliberately does not invalidate the account's other tokens -- that is
        `helpers/credentials.issue_link`, which owns the policy, because
        "reissuing supersedes the last link" is a decision about the flow
        rather than about this table.
        """
        return cls(
            user_id=user_id,
            token_hash=token_hash,
            purpose=purpose if purpose in PURPOSES else "reset",
            expires_at=datetime.utcnow() + timedelta(minutes=minutes),
            issued_by_id=issued_by_id,
        )

    def __repr__(self):
        state = "used" if self.used_at else ("expired" if self.is_expired else "live")
        return f"<PasswordResetToken user={self.user_id} {self.purpose} {state}>"
