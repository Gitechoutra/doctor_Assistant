import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineLockClosed,
  HiOutlineUser,
} from "react-icons/hi2";
import Logo from "../components/Logo";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Username or email, in one field. Staff are issued a username
  // (sandeep.viswanadh) and told it in their welcome email, but the address
  // they were mailed at works just as well — and remembering which of the two
  // this particular system wanted is not a thing to make anybody do.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const redirectTo = location.state?.from?.pathname || "/dashboard";

  // No email-shape or domain check here on purpose. `EMAIL_DOMAINS` (see
  // utils/contact.js) constrains what a NEW address may be when the hospital
  // is the one creating the record — a patient, a staff account. Signing in
  // is the opposite case: this is somebody's own account, already created,
  // and `_find_by_identifier` on the server looks it up by exact email or
  // username with no domain opinion of its own. A domain check here could
  // only ever reject a real, working login — which is exactly what it did.
  // The `required` attribute on the input is the only validation this field
  // needs.

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    try {
      const user = await login(identifier, password);
      // The one sign-in for every role. Nurses, pharmacists and lab
      // technicians have their own module trees; everyone else lands on
      // /dashboard.
      const MODULE_HOME = {
        nurse: "/nurse",
        pharmacist: "/pharmacy",
        lab_technician: "/lab",
      };
      const home = MODULE_HOME[user?.role] || redirectTo;
      navigate(home, { replace: true });
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Unable to sign in. Please try again.");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4">
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-brand-900/10 backdrop-blur-xl">
        <Logo className="justify-center" />

        <h1 className="mt-6 text-center text-xl font-bold text-slate-900">
          Welcome back
        </h1>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Username or email
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <HiOutlineUser className="h-4.5 w-4.5 text-slate-400" />
              <input
                // Not type="email" any more: the browser's own validation
                // would reject "sandeep.viswanadh" before the form ever
                // submitted, with a message about a missing '@'.
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="sandeep.viswanadh"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label className="block text-xs font-semibold text-slate-600">
                Password
              </label>
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
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl hover:shadow-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* No public sign-up: staff accounts are created by an administrator
            through Staff Management, which emails the username and a
            temporary password to the staff member directly. */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Staff accounts are issued by your hospital administrator, who emails you
          your username and a temporary password.
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
