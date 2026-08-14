import { useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineClipboard,
  HiOutlineExclamationTriangle,
  HiOutlineXMark,
} from "react-icons/hi2";

/**
 * What the administrator sees after an account is created or its credentials
 * are resent.
 *
 * Two quite different things wear the same shape here, and the difference is
 * the point:
 *
 *   * **the email went** — a green line naming the username, and nothing else.
 *     The password is not shown because it was never ours to show.
 *   * **the email did not go** — the sign-in details, once, in a panel that
 *     says so. The account exists at that point and is otherwise unreachable,
 *     so withholding them would strand a real person; this is the one path on
 *     which an administrator sees a temporary password, and it is deliberately
 *     the path that looks like a problem, because it is one.
 *
 * Nothing here is re-fetchable. Dismissing it is final, which is why the
 * failure panel says so and offers Copy.
 */
function CopyField({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is denied outside a secure context (plain http on a
      // LAN, which a hospital deployment may well be). The value is on screen
      // and selectable either way, so this is not worth an error message.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-36 shrink-0 text-xs text-slate-500">{label}</span>
      <code
        className={`min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-800 ring-1 ring-slate-200 ${
          mono ? "font-mono" : ""
        }`}
        title={value}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700"
      >
        {copied ? (
          "Copied"
        ) : (
          <span className="flex items-center gap-1">
            <HiOutlineClipboard className="h-3.5 w-3.5" />
            Copy
          </span>
        )}
      </button>
    </div>
  );
}

export default function CredentialsNotice({ notice, onDismiss }) {
  if (!notice) return null;

  const { message, name, email, credentials } = notice;
  const sent = credentials?.email_sent;

  if (sent) {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
        <HiOutlineCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1 text-sm text-emerald-900">
          <p>{message}</p>
          <p className="mt-1 text-xs text-emerald-700">
            {name} signs in as{" "}
            <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono">
              {credentials.username}
            </span>
            . They set their own password from the link in that email.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-emerald-600 transition hover:bg-emerald-100"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <HiOutlineExclamationTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">{message}</p>
          <p className="mt-1 text-xs text-amber-800">
            Give these to {name} in person or by a channel you trust, and ask them to
            use the link to set their own password.{" "}
            <span className="font-semibold">
              This panel cannot be shown again — closing it discards the password.
            </span>
          </p>

          <div className="mt-3 space-y-2 rounded-lg bg-amber-100/60 p-3">
            <CopyField label="Username" value={credentials.username} />
            <CopyField label="Email" value={email} mono={false} />
            <CopyField label="Temporary password" value={credentials.temp_password} />
            {credentials.reset_link && (
              <CopyField label="Set-password link" value={credentials.reset_link} />
            )}
          </div>

          {credentials.email_state === "unconfigured" && (
            <p className="mt-2 text-[11px] text-amber-700">
              To send these automatically in future, fill in the{" "}
              <code>[mail_server_Email]</code> section of{" "}
              <code>backend/config/dev.ini</code> (or set MAIL_SERVER, MAIL_USERNAME
              and MAIL_PASSWORD in <code>backend/.env</code>).
            </p>
          )}
          {credentials.email_state === "disabled" && (
            <p className="mt-2 text-[11px] text-amber-700">
              A mail server <em>is</em> configured — sending is switched off. Set{" "}
              <code>enabled = true</code> in the <code>[mail_server_Email]</code>{" "}
              section of <code>backend/config/dev.ini</code> to turn it back on.
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-amber-700 transition hover:bg-amber-100"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
