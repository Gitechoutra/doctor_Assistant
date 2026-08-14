import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle } from "react-icons/hi2";
import Logo from "../components/Logo";
import PasswordInput from "../components/PasswordInput";
import { MIN_PASSWORD, checkResetLink, resetPassword } from "../services/authService";

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/**
 * Where a staff member lands from the link in their welcome or reset email.
 *
 * The link is checked before the form is drawn, rather than on submit: a link
 * that expired while the message sat unread is the common case, and finding
 * that out *after* choosing a password is a small insult. The account it
 * belongs to is named on the form for the same reason — it is confirmation for
 * the person holding the link, and it tells nobody else anything, since having
 * the link is already the harder half.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [account, setAccount] = useState(null);
  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLinkError("This link is incomplete. Open it straight from your email.");
      setChecking(false);
      return;
    }
    let cancelled = false;
    checkResetLink(token)
      .then((data) => !cancelled && setAccount(data))
      .catch(
        (err) =>
          !cancelled &&
          setLinkError(
            err.response?.data?.message ||
              "This link could not be checked. Please try again."
          )
      )
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The API reports the rule alongside the link, so a change on the server
  // reaches this form without a redeploy. MIN_PASSWORD is the fallback.
  const minLength = account?.min_password || MIN_PASSWORD;
  const tooShort = password.length > 0 && password.length < minLength;
  const mismatch = confirm.length > 0 && password !== confirm;

  // Whether to ask for the password the account has right now. The server
  // decides, from the kind of link: an invite carries a temporary password
  // the staff member can type, a forgotten-password link by definition does
  // not. Driving it from the response keeps one screen honest for both.
  const needsCurrent = Boolean(account?.requires_current_password);
  const sameAsCurrent =
    needsCurrent && password.length > 0 && password === currentPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    if (mismatch) {
      setErrorMsg("Those passwords do not match.");
      return;
    }
    if (sameAsCurrent) {
      setErrorMsg("Your new password must be different from the temporary one.");
      return;
    }
    setSaving(true);
    try {
      await resetPassword(token, password, confirm, currentPassword);
      setDone(true);
      // Long enough to read the confirmation, short enough not to feel stuck.
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not set that password. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4">
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-brand-900/10 backdrop-blur-xl">
        <Logo className="justify-center" />

        {checking ? (
          <div className="mt-8 space-y-3">
            <div className="mx-auto h-5 w-40 animate-pulse rounded bg-slate-100" />
            <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : linkError ? (
          <>
            <HiOutlineExclamationTriangle className="mx-auto mt-6 h-10 w-10 text-amber-500" />
            <h1 className="mt-3 text-center text-xl font-bold text-slate-900">
              This link can't be used
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
              {linkError}
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 block w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl"
            >
              Send me a new link
            </Link>
          </>
        ) : done ? (
          <>
            <HiOutlineCheckCircle className="mx-auto mt-6 h-10 w-10 text-emerald-500" />
            <h1 className="mt-3 text-center text-xl font-bold text-slate-900">
              Password changed
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
              Use it the next time you sign in. The temporary password you were
              emailed no longer works.
            </p>
            <p className="mt-2 text-center text-xs text-slate-400">
              Taking you to the sign-in page…
            </p>
            <Link
              to="/login"
              className="mt-6 block w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl"
            >
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-center text-xl font-bold text-slate-900">
              Choose your password
            </h1>
            <p className="mt-1 text-center text-sm text-slate-500">
              For {account?.name}
              {account?.username ? (
                <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                  {account.username}
                </span>
              ) : null}
            </p>
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-center text-xs leading-relaxed text-brand-800">
              Nobody at the hospital — including your administrator — can see the
              password you choose here.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Only for an invite link. A "forgot password" visitor cannot
                  supply this and is not asked for it. */}
              {needsCurrent && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Current password
                  </label>
                  <PasswordInput
                    required
                    autoFocus
                    autoComplete="current-password"
                    className={input}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Temporary password from your email"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Copy it from your welcome email — it is case-sensitive.
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  New password
                </label>
                <PasswordInput
                  required
                  // Focus goes to the first empty field: the current-password
                  // box when there is one, this box otherwise.
                  autoFocus={!needsCurrent}
                  minLength={minLength}
                  autoComplete="new-password"
                  className={`${input} ${tooShort || sameAsCurrent ? "border-red-300" : ""}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${minLength} characters`}
                />
                {tooShort && (
                  <p className="mt-1 text-[11px] font-medium text-red-600">
                    {password.length} of {minLength} characters
                  </p>
                )}
                {sameAsCurrent && !tooShort && (
                  <p className="mt-1 text-[11px] font-medium text-red-600">
                    Must be different from your temporary password.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Confirm password
                </label>
                <PasswordInput
                  required
                  autoComplete="new-password"
                  className={`${input} ${mismatch ? "border-red-300" : ""}`}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {mismatch && (
                  <p className="mt-1 text-[11px] font-medium text-red-600">
                    Passwords do not match.
                  </p>
                )}
              </div>

              {errorMsg && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={
                  saving ||
                  tooShort ||
                  mismatch ||
                  sameAsCurrent ||
                  !password ||
                  (needsCurrent && !currentPassword)
                }
                className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl hover:shadow-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Set password"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="font-semibold text-slate-500 hover:text-slate-700">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
