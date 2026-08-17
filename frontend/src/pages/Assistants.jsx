import { useEffect, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineEnvelope,
  HiOutlineExclamationTriangle,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import ConfirmDialog from "../components/ConfirmDialog";
import { createPA, deletePA, fetchPAs } from "../services/paService";

/**
 * The doctor's screen for setting the desk up.
 *
 * A fresh practice comes up with the seeded doctor account and nobody else —
 * see `portal/seeders/seed_doctor.py`. This is where that is fixed: the doctor
 * enters a name and an email, and the account exists when the form returns.
 *
 * **There is no handover.** The doctor does not choose the first password and
 * is never shown it: the server generates one, hashes it, and emails it to the
 * assistant with a single-use link to replace it. So the only thing this screen
 * can report afterwards is that the invitation went — and it can report that
 * honestly, because the API refuses to create an account it could not email.
 */

const EMPTY = { name: "", email: "" };

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

/** What the doctor sees when an assistant has been created.
 *
 *  Their username and the address the invitation went to, and no password —
 *  there is nothing to hand over, and nothing for the doctor to write down.
 *  This panel only ever appears when the mail actually went: the API rolls the
 *  account back if it could not send, so "we have emailed them" is never a
 *  guess made on this screen. */
function InvitedPanel({ account, onDismiss }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start gap-3">
        <HiOutlineCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-emerald-900">
            {account.name}&rsquo;s account is ready
          </h2>
          <p className="mt-1 text-xs text-emerald-800">
            We have emailed their sign-in details and a link to set their own
            password. The link can be used once and expires, so ask them to open
            it soon — if it lapses, &ldquo;Forgot password&rdquo; on the sign-in
            page sends a fresh one.
          </p>

          <dl className="mt-3 space-y-1.5 rounded-xl bg-white/70 p-3 font-mono text-xs text-slate-800">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">Username</dt>
              <dd className="break-all">{account.username}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">Sent to</dt>
              <dd className="break-all">{account.email}</dd>
            </div>
          </dl>

          <div className="mt-3">
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              <HiOutlineEnvelope className="h-4 w-4" />
              Done
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
  const [issued, setIssued] = useState(null); // the created account, or null
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
      const created = await createPA({
        name: form.name.trim(),
        email: form.email.trim(),
      });
      setIssued(created);
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
          <InvitedPanel account={issued} onDismiss={() => setIssued(null)} />
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
                queue are the desk's work. Add your assistant — their sign-in
                details are emailed to them straight away.
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
          </div>

          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            You do not set a password. One is generated on the server and
            emailed to {form.email.trim() || "the address above"}, with a link
            to replace it with a password only they know.
          </p>

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
