import { useEffect, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineClipboard,
  HiOutlineExclamationTriangle,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import ConfirmDialog from "../components/ConfirmDialog";
import PasswordInput from "../components/PasswordInput";
import { MIN_PASSWORD } from "../services/authService";
import { createPA, deletePA, fetchPAs } from "../services/paService";

/**
 * The doctor's screen for setting the desk up.
 *
 * A fresh practice comes up with the seeded doctor account and nobody else —
 * see `portal/seeders/seed_doctor.py`. This is where that is fixed: the doctor
 * enters the assistant's details, and the account exists and works when the
 * form returns.
 *
 * The one thing this screen has to get right is the handover. The raw password
 * comes back exactly once, is stored nowhere, and no route reads it back — so
 * the panel that shows it is deliberately hard to miss and says plainly that
 * it will not be shown again.
 */

const EMPTY = { name: "", email: "", password: "" };

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

/** The credentials, shown once. Copyable, because the alternative is the
 *  doctor transcribing a generated password by eye.
 *
 *  `emailSent` is the server's account of what actually happened, not an
 *  assumption. The account is created either way — that part is committed
 *  before the mail is attempted — so this stays the "it worked" panel, and the
 *  delivery failure is called out inside it rather than replacing it. Saying
 *  "we emailed them" when we did not is the one thing this must never do: the
 *  doctor would stop handing the credentials over, and the assistant would
 *  wait for a message that is not coming. */
function CredentialsPanel({ credentials, name, emailSent, emailError, onDismiss }) {
  const [copied, setCopied] = useState(false);

  const block = [
    `Sign-in for ${name}`,
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
            {name} can sign in now
          </h2>
          <p className="mt-1 text-xs text-emerald-800">
            {credentials.password_was_generated
              ? "We generated this password. "
              : "This is the password you set. "}
            Give these to your assistant — they are shown once and are not
            stored anywhere, so they cannot be looked up again.
            {emailSent
              ? " A copy has also been emailed to them, with a link to set a password only they know."
              : ""}
          </p>

          {!emailSent && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-xs font-semibold text-amber-900">
                  We could not email these to {name}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {emailError ||
                    "The account was created, but the email could not be sent."}{" "}
                  They can still sign in with the password above, and set their
                  own from Profile once they are in.
                </p>
              </div>
            </div>
          )}

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

export default function Assistants() {
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [issued, setIssued] = useState(null); // { credentials, name }
  const [confirmDelete, setConfirmDelete] = useState(null); // the assistant, or null
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      setAssistants(await fetchPAs());
    } catch {
      setErrorMsg("Could not load the practice's assistants.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete() {
    const pa = confirmDelete;
    setDeleting(true);
    setErrorMsg("");
    try {
      await deletePA(pa.id);
      // Drops it from view the moment the server confirms, rather than
      // waiting on a refetch the doctor would just be staring through.
      setAssistants((list) => list.filter((a) => a.id !== pa.id));
      setConfirmDelete(null);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not delete this assistant.");
    } finally {
      setDeleting(false);
    }
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSaving(true);
    try {
      // Only send what was filled in — a blank password means "generate one",
      // which is not the same as sending an empty string.
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => String(v).trim() !== "")
      );
      const created = await createPA(payload);
      setIssued({
        credentials: created.credentials,
        name: created.name,
        emailSent: created.email_sent,
        emailError: created.email_error,
      });
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not create the assistant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Assistants</h1>
          <p className="mt-1 text-sm text-slate-500">
            The people who run your desk. Each gets their own sign-in.
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
            Add assistant
          </button>
        )}
      </div>

      {errorMsg && !showForm && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
      )}

      {issued && (
        <div className="mt-6">
          <CredentialsPanel
            credentials={issued.credentials}
            name={issued.name}
            emailSent={issued.emailSent}
            emailError={issued.emailError}
            onDismiss={() => setIssued(null)}
          />
        </div>
      )}

      {/* The empty state is the whole point of this screen on a fresh
          practice: only your own account exists until you make one, and
          registration, booking and the queue are all the desk's work. Say so,
          rather than showing an empty list. */}
      {!loading && assistants.length === 0 && !showForm && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <HiOutlineExclamationTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                This practice has no assistant yet
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Registering patients, booking appointments and running the day's
                queue are the desk's work. Add your assistant and hand them the
                credentials this screen gives you.
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
            <h2 className="text-sm font-semibold text-slate-900">Add an assistant</h2>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Labelled label="Full name">
              <input
                required
                autoFocus
                className={inputClass}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Labelled>
            <Labelled
              label="Email"
              hint="What they sign in with, and where their credentials are sent."
            >
              <input
                required
                type="email"
                className={inputClass}
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
              {saving ? "Creating…" : "Create assistant"}
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

      {assistants.length > 0 && (
        <div className="mt-6 space-y-3">
          {assistants.map((pa) => (
            <div
              key={pa.id}
              className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <Avatar name={pa.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{pa.name}</p>
                <p className="mt-1 break-all text-xs text-slate-400">
                  {pa.email}
                  {pa.username ? ` · ${pa.username}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {pa.last_login_at
                    ? `Last signed in ${new Date(pa.last_login_at).toLocaleString()}`
                    : "Has not signed in yet"}
                </p>
              </div>
              {!pa.is_active && (
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                  Disabled
                </span>
              )}
              <button
                type="button"
                onClick={() => setConfirmDelete(pa)}
                title={`Delete ${pa.name}`}
                aria-label={`Delete ${pa.name}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
              >
                <HiOutlineTrash className="h-3.5 w-3.5 shrink-0" />
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.name}?`}
          message={`This permanently removes ${confirmDelete.name}'s account and sign-in credentials. They will no longer be able to log in. This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
