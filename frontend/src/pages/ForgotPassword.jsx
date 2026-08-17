import { useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineCheckCircle, HiOutlineUser } from "react-icons/hi2";
import Logo from "../components/Logo";
import { requestPasswordReset } from "../services/authService";

/**
 * "I can't get in."
 *
 * The confirmation screen is deliberately the same whether or not the account
 * exists — the server answers identically for both, so that an unauthenticated
 * visitor cannot use this page to find out who works at the practice. There is
 * nothing to add here that the server is not willing to say.
 */
export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // No domain check here — same reasoning as the sign-in field (see
  // Login.jsx): this identifies an account that already exists, and the
  // server's lookup has no domain opinion of its own.

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setErrorMsg("");
    try {
      await requestPasswordReset(identifier.trim());
      setSent(true);
    } catch (err) {
      // Only a network or server failure reaches here — a wrong identifier is
      // a 200 by design.
      setErrorMsg(
        err.response?.data?.message || "Could not send that request. Please try again."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4">
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-brand-900/10 backdrop-blur-xl">
        <Logo className="justify-center" />

        {sent ? (
          <>
            <HiOutlineCheckCircle className="mx-auto mt-6 h-10 w-10 text-emerald-500" />
            <h1 className="mt-3 text-center text-xl font-bold text-slate-900">
              Check your email
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
              If that account exists, a link to set a new password is on its way to
              the address on file. It can only be used once, and it expires shortly —
              so use it as soon as it arrives.
            </p>
            <p className="mt-4 text-center text-xs text-slate-400">
              Nothing arrived? Check your spam folder, then ask whoever set up
              administrator to resend your sign-in details.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-center text-xl font-bold text-slate-900">
              Forgot your password?
            </h1>
            <p className="mt-1 text-center text-sm text-slate-500">
              Enter your username or email and we'll send you a link to set a new one.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Username or email
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
                  <HiOutlineUser className="h-4.5 w-4.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              {errorMsg && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl hover:shadow-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send reset link"}
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
