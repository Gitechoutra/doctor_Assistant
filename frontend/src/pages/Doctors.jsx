import { useEffect, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineClipboard,
  HiOutlineExclamationTriangle,
  HiOutlinePlus,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import PasswordInput from "../components/PasswordInput";
import { MIN_PASSWORD } from "../services/authService";
import { createDoctor, fetchDoctors } from "../services/doctorService";

/**
 * The PA's screen for setting the practice's doctor up.
 *
 * There is no default doctor any more — a fresh practice signs in as the PA
 * and has nobody to book into. This is where that is fixed: the PA enters the
 * details the doctor gives them, and the account exists and works when the
 * form returns.
 *
 * The one thing this screen has to get right is the handover. The raw password
 * comes back exactly once, is stored nowhere, and no route reads it back — so
 * the panel that shows it is deliberately hard to miss and says plainly that
 * it will not be shown again.
 */

const EMPTY = {
  name: "",
  email: "",
  password: "",
  specialization: "",
  qualification: "",
  registration_no: "",
  practice_name: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function Labelled({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** The credentials, shown once. Copyable, because the alternative is the PA
 *  transcribing a generated password by eye. */
function CredentialsPanel({ credentials, name, onDismiss }) {
  const [copied, setCopied] = useState(false);

  const block = [
    `Sign-in for Dr. ${name}`,
    `Username: ${credentials.username}`,
    `Email:    ${credentials.email}`,
    `Password: ${credentials.password}`,
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers. The
      // values are on screen regardless, which is the part that matters.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start gap-3">
        <HiOutlineCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-emerald-900">
            Dr. {name} can sign in now
          </h2>
          <p className="mt-1 text-xs text-emerald-800">
            {credentials.password_was_generated
              ? "We generated this password. "
              : "This is the password you set. "}
            Give these to the doctor — they are shown once and are not stored
            anywhere, so they cannot be looked up again. A copy has also been
            emailed to them, with a link to set a password only they know.
          </p>

          <dl className="mt-3 space-y-1.5 rounded-xl bg-white/70 p-3 font-mono text-xs text-slate-800">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">Username</dt>
              <dd className="break-all">{credentials.username}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">Email</dt>
              <dd className="break-all">{credentials.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">Password</dt>
              <dd className="break-all font-semibold">{credentials.password}</dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              <HiOutlineClipboard className="h-4 w-4" />
              {copied ? "Copied" : "Copy details"}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              I've saved these
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Doctors() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [issued, setIssued] = useState(null); // { credentials, name }

  async function load() {
    try {
      setDoctors(await fetchDoctors());
    } catch {
      setErrorMsg("Could not load the practice's doctors.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSaving(true);
    try {
      // Only send what was filled in — the server treats absent and empty
      // differently for the optional fields.
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => String(v).trim() !== "")
      );
      const created = await createDoctor(payload);
      setIssued({ credentials: created.credentials, name: created.name });
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not create the doctor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Doctors</h1>
          <p className="mt-1 text-sm text-slate-500">
            The doctors of this practice, and where you add a new one.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              setIssued(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Add doctor
          </button>
        )}
      </div>

      {issued && (
        <div className="mt-6">
          <CredentialsPanel
            credentials={issued.credentials}
            name={issued.name}
            onDismiss={() => setIssued(null)}
          />
        </div>
      )}

      {/* The empty state is the whole point of this screen on a fresh
          practice: no doctor exists until the PA makes one, and nothing can be
          booked until then. Say so, rather than showing an empty list. */}
      {!loading && doctors.length === 0 && !showForm && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <HiOutlineExclamationTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                This practice has no doctor yet
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Appointments, the queue and consultations all resolve to a
                doctor, so nothing can be booked until one exists. Add the
                practice's doctor with the details they give you.
              </p>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <HiOutlineUserPlus className="h-5 w-5 text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-900">Add a doctor</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Enter the details the doctor gives you. Their account and sign-in
            are created together, and they can sign in straight away.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Labelled label="Full name">
              <input
                required
                autoFocus
                className={inputClass}
                placeholder="Anita Sharma"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Labelled>
            <Labelled label="Email" hint="What they sign in with, and where their credentials are sent.">
              <input
                required
                type="email"
                className={inputClass}
                placeholder="anita.sharma@gmail.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Labelled>

            <div className="sm:col-span-2">
              <Labelled
                label="Password"
                hint={`Leave blank and one will be generated for you. At least ${MIN_PASSWORD} characters.`}
              >
                <PasswordInput
                  className={inputClass}
                  autoComplete="new-password"
                  placeholder="Generate one for me"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
              </Labelled>
            </div>

            <Labelled label="Specialization" hint="Defaults to General Medicine.">
              <input
                className={inputClass}
                placeholder="Cardiology"
                value={form.specialization}
                onChange={(e) => set("specialization", e.target.value)}
              />
            </Labelled>
            <Labelled label="Qualification">
              <input
                className={inputClass}
                placeholder="MBBS, MD"
                value={form.qualification}
                onChange={(e) => set("qualification", e.target.value)}
              />
            </Labelled>
            <Labelled label="Registration number">
              <input
                className={inputClass}
                placeholder="TSMC/FMR/12345"
                value={form.registration_no}
                onChange={(e) => set("registration_no", e.target.value)}
              />
            </Labelled>
            <Labelled label="Practice name" hint="Printed on prescriptions and reports.">
              <input
                className={inputClass}
                placeholder="Sharma Clinic"
                value={form.practice_name}
                onChange={(e) => set("practice_name", e.target.value)}
              />
            </Labelled>
          </div>

          {errorMsg && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMsg}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create doctor"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY);
                setErrorMsg("");
              }}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {doctors.length > 0 && (
        <div className="mt-6 space-y-3">
          {doctors.map((d) => (
            <div
              key={d.id}
              className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <Avatar name={d.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Dr. {d.name}</p>
                <p className="text-xs text-slate-500">
                  {d.specialization}
                  {d.qualification ? ` · ${d.qualification}` : ""}
                </p>
                <p className="mt-1 break-all text-xs text-slate-400">
                  {d.email}
                  {d.username ? ` · ${d.username}` : ""}
                </p>
                {d.created_by_name && (
                  <p className="mt-1 text-xs text-slate-400">
                    Added by {d.created_by_name}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
