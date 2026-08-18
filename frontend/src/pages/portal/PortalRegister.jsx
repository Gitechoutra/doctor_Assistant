import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../../components/Logo";
import { usePortalAuth } from "../../context/PortalAuthContext";

/**
 * Registering for the portal.
 *
 * The form asks for a mobile number and a date of birth because of what the
 * server does with them, and the copy says so: if the practice already holds a
 * record under that number, those two facts are what let the account attach to
 * it rather than starting a second one. A patient seen at the desk last month
 * should sign in and find their history there — and a doctor should never be
 * reading half a history because one person ended up as two rows.
 *
 * When they do not match, the server refuses and says to contact the practice.
 * That is deliberately a dead end here: identifying somebody who cannot prove
 * who they are is desk work, not something a form should try to negotiate.
 */

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function PortalRegister() {
  const { register, isLoading } = usePortalAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    dob: "",
    gender: "",
    password: "",
  });
  const [errorMsg, setErrorMsg] = useState("");

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    try {
      await register({
        ...form,
        // The server treats an empty string as "not given" for both of these,
        // but sending null says so plainly rather than relying on that.
        dob: form.dob || null,
        gender: form.gender || null,
      });
      navigate("/portal/appointments", { replace: true });
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not create your account. Please try again."
      );
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4 py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative w-full max-w-lg rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-brand-900/10 backdrop-blur-xl">
        <Logo className="justify-center" />

        <h1 className="mt-6 text-center text-xl font-bold text-slate-900">
          Create your account
        </h1>
        <p className="mt-1.5 text-center text-sm text-slate-500">
          Already a patient here? Use the mobile number and date of birth the
          practice holds, and your existing records will be waiting for you.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <Field label="Full name">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="As the practice knows you"
              required
              className={INPUT}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile number" hint="10 digits, no spaces or symbols">
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={10}
                placeholder="9876543210"
                required
                className={INPUT}
              />
            </Field>

            <Field label="Date of birth" hint="Optional, but it helps us find you">
              <input
                type="date"
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Email address" hint="This is what you will sign in with">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className={INPUT}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gender">
              <select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
                className={INPUT}
              >
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </Field>

            <Field label="Password" hint="At least 8 characters">
              <input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className={INPUT}
              />
            </Field>
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
            {isLoading ? "Creating your account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/portal/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
