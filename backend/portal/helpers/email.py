"""Outbound email.

Every message the portal sends leaves through `send_email`, and every message
it knows how to compose is one of the three `send_*` functions at the bottom
of this file. Both halves are deliberate: the transport is configured in one
place, and no route anywhere builds an email body of its own.

**Nothing here raises.** A send that fails returns False and is logged. The
account creation that triggered it has already been committed by then, and
losing a staff record because a mail server was briefly unreachable would be
the worse failure by a wide margin -- so the caller is handed the outcome and
decides what to tell the administrator. `POST /api/staff/<id>/credentials`
exists precisely so a False can be acted on.

**With no SMTP host configured, messages are logged instead of sent** -- the
recipient, the subject and, importantly, the reset link. That is what lets a
developer complete the whole staff-creation flow on a laptop with no mail
account: the link is in logs/portal.log, and the flow it belongs to is real.
`MAIL_ENABLED = false` does the same on a machine that *does* have SMTP,
which is how the test config keeps a suite from mailing real people.

Sending is synchronous, inside the request. It is bounded by SMTP_TIMEOUT
(20s by default) and only ever happens on an administrator's explicit action
-- creating one account, or resending one set of credentials. That the admin
finds out in the same response whether the mail actually went is worth more
here than the latency saved by handing it to a background thread, because the
answer changes what they do next.
"""

import html
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr

from flask import current_app

from portal.helpers.credentials import greeting_name
from portal.models.role import role_label

# Brand colours, matching the portal's own gradient. Inline styles rather than
# a stylesheet: every mail client that matters strips <style> blocks, and a
# credentials email that arrives unstyled must still be perfectly readable --
# which is why the layout below is a single column and the important values
# are in a definition list rather than positioned by CSS.
BRAND = "#4f46e5"
BRAND_DARK = "#4338ca"
INK = "#0f172a"
MUTED = "#64748b"
LINE = "#e2e8f0"
PANEL = "#f8fafc"


# -- Transport ---------------------------------------------------------------


def _settings():
    """The mail configuration, resolved once per send."""
    cfg = current_app.config

    # MAIL_FROM is accepted in either form a config file writes it:
    #
    #     from_address = care@yasodhahospitals.com
    #     from_address = Yasodha Hospitals <care@yasodhahospitals.com>
    #
    # parseaddr splits the second into its parts. Without this the whole
    # string would be treated as an address and re-wrapped by formataddr into
    # `Name <Name <addr>>`, which is not a valid header -- and the Message-ID
    # domain, taken from the text after the last '@', would end up as
    # "yasodhahospitals.com>".
    display, address = parseaddr((cfg.get("MAIL_FROM") or "").strip())

    return {
        "host": (cfg.get("SMTP_HOST") or "").strip(),
        "port": cfg.get("SMTP_PORT") or 587,
        "user": (cfg.get("SMTP_USER") or "").strip(),
        "password": cfg.get("SMTP_PASSWORD") or "",
        "security": (cfg.get("SMTP_SECURITY") or "starttls").strip().lower(),
        "timeout": cfg.get("SMTP_TIMEOUT") or 20,
        "sender": address,
        # An explicitly configured name wins; a name carried inside MAIL_FROM
        # is the fallback.
        "sender_name": (cfg.get("MAIL_FROM_NAME") or "").strip() or display.strip(),
        "reply_to": (cfg.get("MAIL_REPLY_TO") or "").strip(),
        "enabled": bool(cfg.get("MAIL_ENABLED", True)),
    }


def delivery_state():
    """Why a send would or wouldn't be attempted: ready / disabled / unconfigured.

    Three states rather than a boolean, because the two failing ones need
    different things done about them and an administrator cannot tell them
    apart from the outcome:

      * `unconfigured` -- nobody has filled in a mail server. Somebody must.
      * `disabled` -- one *is* configured, and sending was deliberately
        switched off (MAIL_ENABLED / `enabled = false`). Telling an admin
        "no mail server is configured" here would send them to fix a file
        that is already correct.
      * `ready` -- a send will be attempted. Whether it arrives is SMTP's
        business, and `send_email` reports that separately.
    """
    s = _settings()
    if not (s["host"] and s["sender"]):
        return "unconfigured"
    return "ready" if s["enabled"] else "disabled"


def is_configured():
    """Whether a real send would be attempted. See `delivery_state`."""
    return delivery_state() == "ready"


def _open(s):
    """A connected, authenticated SMTP session. The caller closes it."""
    context = ssl.create_default_context()

    if s["security"] == "ssl":
        server = smtplib.SMTP_SSL(s["host"], s["port"], timeout=s["timeout"], context=context)
    else:
        server = smtplib.SMTP(s["host"], s["port"], timeout=s["timeout"])
        if s["security"] == "starttls":
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()

    # A relay on localhost typically wants no credentials at all, and calling
    # login() against one fails the send outright.
    if s["user"]:
        server.login(s["user"], s["password"])
    return server


def send_email(to, subject, html_body, text_body=None, reply_to=None):
    """Sends one message. Returns True if the server accepted it.

    `text_body` is not optional in spirit: a multipart message whose plain-text
    part is missing is scored as spam by most filters, and the credentials
    email is exactly the message that must not land in a junk folder. Every
    composer below passes one.
    """
    recipient = (to or "").strip()
    if not recipient:
        current_app.logger.warning("Email not sent: no recipient address (%s)", subject)
        return False

    s = _settings()

    if not (s["enabled"] and s["host"]):
        # The developer path. Logged at warning so it stands out in the file,
        # and with the body, because the reset link inside it is the only copy
        # that exists.
        current_app.logger.warning(
            "Email not sent (no SMTP configured) -- to: %s | subject: %s\n%s",
            recipient,
            subject,
            text_body or "(html only)",
        )
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((s["sender_name"] or None, s["sender"]))
    message["To"] = recipient
    if reply_to or s["reply_to"]:
        message["Reply-To"] = reply_to or s["reply_to"]
    # Without an explicit Message-ID some servers generate one from the local
    # hostname, which on a laptop is not a resolvable domain and reads as
    # forged to the receiving filter.
    message["Message-ID"] = make_msgid(domain=s["sender"].split("@")[-1] or None)
    # Credentials and reset links are transactional and must never be filed as
    # a newsletter, nor auto-replied to by an out-of-office.
    message["Auto-Submitted"] = "auto-generated"

    message.set_content(text_body or _strip_tags(html_body))
    message.add_alternative(html_body, subtype="html")

    try:
        server = _open(s)
        try:
            server.send_message(message)
        finally:
            server.quit()
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        # See the module docstring: the caller is told, the request is not
        # failed. OSError covers the connection refused / DNS / timeout cases,
        # which are the common ones and are not SMTPExceptions.
        current_app.logger.error(
            "Could not email %s (%s): %s", recipient, subject, exc
        )
        return False

    current_app.logger.info("Emailed %s -- %s", recipient, subject)
    return True


def _strip_tags(markup):
    """A crude plain-text fallback, used only if a composer forgets one."""
    text = re.sub(r"<br\s*/?>|</p>|</div>|</tr>", "\n", markup or "")
    return html.unescape(re.sub(r"<[^>]+>", "", text)).strip()


# -- Layout ------------------------------------------------------------------


def _hospital():
    return current_app.config.get("HOSPITAL") or {}


def _layout(heading, lede, blocks, footer_note=None):
    """Wraps composed content in the hospital's letterhead.

    `blocks` is a list of ready HTML fragments, kept as a list so a composer
    reads as the sequence of things the recipient sees.
    """
    hospital = _hospital()
    name = html.escape(hospital.get("name") or "Hospital Portal")
    tagline = html.escape(hospital.get("tagline") or "")

    contact_bits = [
        html.escape(hospital.get(k))
        for k in ("address", "phone", "email")
        if hospital.get(k)
    ]
    contact = " &nbsp;·&nbsp; ".join(contact_bits)

    return f"""\
<div style="margin:0;padding:24px 12px;background:{PANEL};
     font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid {LINE};
       border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,{BRAND},{BRAND_DARK});padding:24px 28px;">
      <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">{name}</div>
      <div style="color:#e0e7ff;font-size:13px;margin-top:2px;">{tagline}</div>
    </div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:{INK};">{heading}</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:{MUTED};">{lede}</p>
      {"".join(blocks)}
    </div>
    <div style="padding:18px 28px;background:{PANEL};border-top:1px solid {LINE};
         font-size:11px;line-height:1.6;color:{MUTED};">
      {f'<p style="margin:0 0 6px;">{footer_note}</p>' if footer_note else ""}
      <p style="margin:0;">{contact}</p>
      <p style="margin:6px 0 0;">This is an automated message — please do not reply to it.</p>
    </div>
  </div>
</div>"""


def _detail_table(rows):
    """The account details, as label/value pairs.

    A table, not a styled list: Outlook drops most flexbox and grid, and these
    are the values the recipient will copy character by character.
    """
    cells = "".join(
        f"""<tr>
              <td style="padding:7px 0;font-size:12px;color:{MUTED};white-space:nowrap;
                  vertical-align:top;width:38%;">{html.escape(str(label))}</td>
              <td style="padding:7px 0;font-size:14px;color:{INK};font-weight:600;
                  word-break:break-all;">{value}</td>
            </tr>"""
        for label, value in rows
        if value
    )
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0"
        style="width:100%;border-collapse:collapse;background:{PANEL};border:1px solid {LINE};
        border-radius:12px;padding:6px 16px;margin:0 0 20px;">{cells}</table>"""


def _mono(value):
    """A credential, set apart so it can be read and typed accurately."""
    return (
        f'<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
        f'font-size:14px;background:#ffffff;border:1px solid {LINE};border-radius:6px;'
        f'padding:2px 8px;display:inline-block;">{html.escape(str(value))}</span>'
    )


def _button(label, url):
    return f"""<div style="margin:0 0 20px;">
      <a href="{html.escape(url, quote=True)}"
         style="display:inline-block;background:{BRAND};color:#ffffff;text-decoration:none;
         font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">{html.escape(label)}</a>
    </div>
    <p style="margin:0 0 20px;font-size:11px;line-height:1.6;color:{MUTED};">
      If the button does not work, paste this into your browser:<br>
      <a href="{html.escape(url, quote=True)}" style="color:{BRAND};word-break:break-all;">{html.escape(url)}</a>
    </p>"""


def _paragraph(text):
    return f'<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:{INK};">{text}</p>'


def _expiry_phrase(minutes):
    """"72 hours" / "60 minutes", so the recipient knows what "soon" means."""
    if minutes % 60 == 0 and minutes >= 60:
        hours = minutes // 60
        return f"{hours} hour{'s' if hours != 1 else ''}"
    return f"{minutes} minute{'s' if minutes != 1 else ''}"


# -- The messages the portal sends -------------------------------------------


def send_staff_credentials(
    user,
    *,
    temp_password,
    reset_link,
    login_link,
    link_minutes,
    role_name=None,
    reissued=False,
):
    """The one an administrator's "Create staff account" triggers.

    Carries everything the staff member needs and nothing the hospital keeps a
    copy of: name, role, username, email, the temporary password, where to
    sign in, and the single-use link that replaces the temporary password with
    one only they know.

    Both routes in are offered on purpose. The link is the one we want used --
    it means no password of theirs was ever transmitted -- but a temporary
    password that works today is what stops a new joiner being blocked when
    the link has expired by the time they read the message.

    `reissued=True` when an administrator resent the credentials, which
    invalidates whatever was sent before; saying so is the difference between
    a staff member trying the old password and one knowing not to.
    """
    role = role_label(role_name or (user.role.name if user.role else None))
    hospital = _hospital().get("name") or "the hospital portal"
    expiry = _expiry_phrase(link_minutes)
    greeting = greeting_name(user.name)

    subject = (
        f"Your updated {hospital} sign-in details"
        if reissued
        else f"Your {hospital} staff account"
    )

    lede = (
        "Your sign-in details have been reissued. Anything sent to you before this "
        "message no longer works."
        if reissued
        else f"An account has been created for you at {html.escape(hospital)}. "
        "Here is everything you need to sign in."
    )

    blocks = [
        _paragraph(f"Hello {html.escape(greeting)},"),
        _detail_table(
            [
                ("Name", html.escape(user.name or "")),
                ("Role", html.escape(role)),
                ("Username", _mono(user.username or "")),
                ("Email", html.escape(user.email or "")),
                ("Temporary password", _mono(temp_password)),
            ]
        ),
        _paragraph(
            "You can sign in with either your username or your email address, at "
            f'<a href="{html.escape(login_link, quote=True)}" style="color:{BRAND};">'
            f"{html.escape(login_link)}</a>."
        ),
        _paragraph(
            "<strong>Please set your own password now.</strong> The link below works "
            f"once and expires in {expiry}."
        ),
        _button("Set my password", reset_link),
    ]

    html_body = _layout(
        "Your staff account is ready",
        lede,
        blocks,
        footer_note=(
            "Keep this message private, and delete it once you have set your own "
            "password. Nobody at the hospital — including your administrator — can "
            "see the password you choose."
        ),
    )

    text_body = f"""\
Hello {greeting},

{"Your sign-in details have been reissued. Anything sent to you before this message no longer works." if reissued else f"An account has been created for you at {hospital}."}

  Name:                {user.name or ""}
  Role:                {role}
  Username:            {user.username or ""}
  Email:               {user.email or ""}
  Temporary password:  {temp_password}

Sign in at: {login_link}
You can use either your username or your email address.

Please set your own password now. This link works once and expires in {expiry}:

{reset_link}

Keep this message private, and delete it once you have set your own password.
Nobody at the hospital, including your administrator, can see the password you
choose.

-- {_hospital().get("name") or "Hospital Portal"}
This is an automated message; please do not reply to it.
"""

    return send_email(user.email, subject, html_body, text_body)


def send_password_reset(user, *, reset_link, link_minutes):
    """The one "forgot password" triggers."""
    hospital = _hospital().get("name") or "the hospital portal"
    expiry = _expiry_phrase(link_minutes)
    greeting = greeting_name(user.name)

    blocks = [
        _paragraph(f"Hello {html.escape(greeting)},"),
        _paragraph(
            "Use the button below to choose a new password. It works once and "
            f"expires in {expiry}."
        ),
        _button("Choose a new password", reset_link),
        _detail_table([("Username", _mono(user.username or user.email or ""))]),
    ]

    html_body = _layout(
        "Reset your password",
        f"Somebody asked to reset the password for your {html.escape(hospital)} account.",
        blocks,
        footer_note=(
            "If this wasn't you, no action is needed — your current password still "
            "works and this link can be ignored. Tell your administrator if you get "
            "messages like this unexpectedly."
        ),
    )

    text_body = f"""\
Hello {greeting},

Somebody asked to reset the password for your {hospital} account.

Use this link to choose a new one. It works once and expires in {expiry}:

{reset_link}

Your username is: {user.username or user.email or ""}

If this wasn't you, no action is needed -- your current password still works
and this link can be ignored.

-- {_hospital().get("name") or "Hospital Portal"}
This is an automated message; please do not reply to it.
"""

    return send_email(user.email, f"Reset your {hospital} password", html_body, text_body)


def send_password_changed(user, *, login_link):
    """Sent after a password is actually changed through a reset link.

    Not a courtesy. This is the message that tells somebody their account was
    taken over, and it is the only signal they would get -- an attacker who
    used a stolen link is otherwise entirely silent.
    """
    hospital = _hospital().get("name") or "the hospital portal"
    greeting = greeting_name(user.name)

    blocks = [
        _paragraph(f"Hello {html.escape(greeting)},"),
        _paragraph(
            "Your password has been changed. Use it the next time you sign in — "
            "any temporary password you were sent no longer works."
        ),
        _button("Go to sign in", login_link),
    ]

    html_body = _layout(
        "Your password was changed",
        f"This is a confirmation from {html.escape(hospital)}.",
        blocks,
        footer_note=(
            "If you did not do this, contact your hospital administrator "
            "immediately — somebody else may have access to your account."
        ),
    )

    text_body = f"""\
Hello {greeting},

Your {hospital} password has been changed. Use it the next time you sign in;
any temporary password you were sent no longer works.

Sign in at: {login_link}

If you did not do this, contact your hospital administrator immediately --
somebody else may have access to your account.

-- {_hospital().get("name") or "Hospital Portal"}
This is an automated message; please do not reply to it.
"""

    return send_email(user.email, f"Your {hospital} password was changed", html_body, text_body)
