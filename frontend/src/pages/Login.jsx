import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineLockClosed,
  HiOutlineUser,
} from "react-icons/hi2";
import Logo from "../components/Logo";
import { useAuth } from "../context/AuthContext";

/**
 * Sign in.
 *
 * **No role selector.** There used to be a module home per role and a lookup
 * that decided where to send somebody; both are gone, and neither was ever a
 * security control — the role comes from the server on the account, and every
 * route re-checks it. A chooser on a sign-in form only ever tells an attacker
 * which roles exist, and tells a real user to answer a question the system
 * already knows the answer to.
 *
 * So: one identifier field (username or email — the server tells them apart by
 * the '@'), one password, and both roles land on /dashboard, which renders
 * whichever of the two it is.
 */
export default function Login() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Where they were headed before being bounced to the login page, so a
  // bookmarked patient record survives an expired session.
  const redirectTo = location.state?.from?.pathname || "/dashboard";

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    try {
      await login(identifier, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Unable to sign in. Please try again.");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-brand-900/10 backdrop-blur-xl">
        <Logo className="justify-center" subtitle="Smart Practice Management for Doctors" />

        <h1 className="mt-6 text-center text-xl font-bold text-slate-900">Welcome back</h1>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Username or email
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <HiOutlineUser className="h-4.5 w-4.5 text-slate-400" />
              <input
                // Not type="email": the browser's own validation would reject
                // a username before the form ever submitted, with a message
                // about a missing '@'.
                type="text"
                required
                autoComplete="username"
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@yourpractice.com"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label className="block text-xs font-semibold text-slate-600">Password</label>
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
              >
                Forgot password?
              </Link>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <HiOutlineLockClosed className="h-4.5 w-4.5 shrink-0 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                className="shrink-0 text-slate-400 transition hover:text-slate-600"
              >
                {showPassword ? (
                  <HiOutlineEyeSlash className="h-4.5 w-4.5" />
                ) : (
                  <HiOutlineEye className="h-4.5 w-4.5" />
                )}
              </button>
            </div>
          </div>

          {errorMsg && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl hover:shadow-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          MediAssist AI is used by two people: the doctor and their PA. Both sign
          in here.
        </p>
        <p className="mt-3 text-center text-sm text-slate-500">
          <Link to="/" className="font-semibold text-slate-500 hover:text-slate-700">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
