import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineEnvelope,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineLockClosed,
} from "react-icons/hi2";
import Logo from "../../components/Logo";
import { usePortalAuth } from "../../context/PortalAuthContext";

/**
 * The patient's sign-in.
 *
 * Its own screen rather than a tab on the staff login, because they are not
 * the same door: the accounts live in different tables, the tokens are scoped
 * differently, and a patient who typed their details into the practice's form
 * would be told their password was wrong when the truth is they were at the
 * wrong page entirely. Each form says plainly who it is for, and links to the
 * other.
 */
export default function PortalLogin() {
  const { login, isLoading } = usePortalAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const redirectTo = location.state?.from?.pathname || "/portal/appointments";

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Unable to sign in. Please try again."
      );
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4 py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-brand-900/10 backdrop-blur-xl">
        <Logo className="justify-center" />

        <h1 className="mt-6 text-center text-xl font-bold text-slate-900">
          Patient sign in
        </h1>
        <p className="mt-1.5 text-center text-sm text-slate-500">
          See your appointments and book a new one.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Email address
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <HiOutlineEnvelope className="h-4.5 w-4.5 shrink-0 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <HiOutlineLockClosed className="h-4.5 w-4.5 shrink-0 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
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
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          New here?{" "}
          <Link
            to="/portal/register"
            className="font-semibold text-brand-700 hover:underline"
          >
            Create an account
          </Link>
        </p>

        <p className="mt-4 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
          Practice staff sign in{" "}
          <Link to="/login" className="font-semibold text-slate-500 hover:underline">
            here
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
