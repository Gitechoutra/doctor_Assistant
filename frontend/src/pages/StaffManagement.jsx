import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineEnvelope,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUsers,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import ConfirmDialog from "../components/ConfirmDialog";
import CredentialsNotice from "../components/staff/CredentialsNotice";
import StaffFormModal, { ROLE_LABELS } from "../components/staff/StaffFormModal";
import {
  deleteStaff,
  fetchStaff,
  fetchStaffOptions,
  resendStaffCredentials,
  setStaffStatus,
} from "../services/staffService";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Disabled" },
];

export default function StaffManagement() {
  const [data, setData] = useState({ items: [], total: 0, active: 0, by_role: {} });
  const [options, setOptions] = useState({});
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [editing, setEditing] = useState(null); // staff object, or "new"
  const [confirming, setConfirming] = useState(null);
  const [resending, setResending] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // The result of the last account creation or credential resend. Shown once
  // and then gone: when the email could not be delivered this holds the only
  // copy of that person's temporary password.
  const [notice, setNotice] = useState(null);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchStaff({ role, status, search: search.trim() || undefined })
        .then((d) => {
          setData(d);
          setErrorMsg("");
        })
        .catch((err) => setErrorMsg(err.response?.data?.message || "Could not load staff."))
        .finally(() => setLoading(false));
    },
    [role, status, search]
  );

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => load(), 250);
    return () => clearTimeout(id);
  }, [load]);

  useEffect(() => {
    fetchStaffOptions().then(setOptions).catch(() => {});
  }, []);

  async function toggleStatus(member) {
    setBusyId(member.id);
    setErrorMsg("");
    try {
      await setStaffStatus(member.id, !member.is_active);
      await load(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not change that account's status.");
    } finally {
      setBusyId(null);
    }
  }

  /** Issues a fresh password and link and emails them again. Whatever was
   *  sent before stops working, so this is behind a confirmation. */
  async function resend(member) {
    setBusyId(member.id);
    setErrorMsg("");
    try {
      const result = await resendStaffCredentials(member.id);
      setResending(null);
      setNotice(result);
      await load(true);
    } catch (err) {
      setResending(null);
      setErrorMsg(
        err.response?.data?.message || "Could not reissue that account's sign-in details."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member) {
    setBusyId(member.id);
    setErrorMsg("");
    try {
      await deleteStaff(member.id);
      setConfirming(null);
      await load(true);
    } catch (err) {
      setConfirming(null);
      setErrorMsg(err.response?.data?.message || "Could not delete that account.");
    } finally {
      setBusyId(null);
    }
  }

  const roleTabs = ["all", ...(options.roles || [])];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Staff</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.total} accounts · {data.active} active
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
        >
          <HiOutlinePlus className="h-4 w-4" />
          Add staff
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
          <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone or employee code…"
            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                status === f.key
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {roleTabs.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              role === r
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {r === "all" ? "All roles" : ROLE_LABELS[r] || r}
            {r !== "all" && data.by_role?.[r] ? (
              <span className="ml-1.5 opacity-70">{data.by_role[r]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <CredentialsNotice notice={notice} onDismiss={() => setNotice(null)} />

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <HiOutlineUsers className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">No staff match this view.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full min-w-[54rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Staff member</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Department</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b border-slate-50 last:border-0 ${
                    m.is_active ? "" : "bg-slate-50/60"
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} imageUrl={m.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{m.name}</p>
                        {/* The username, not the designation, sits under the
                            name: it is what this person types every morning
                            and what an administrator is asked for on the
                            phone. The designation follows it. */}
                        <p className="truncate text-xs text-slate-400">
                          {m.username ? (
                            <span className="font-mono text-slate-500">{m.username}</span>
                          ) : null}
                          {m.username && (m.profile?.designation || m.profile?.employee_code)
                            ? " · "
                            : ""}
                          {m.profile?.designation ||
                            m.profile?.employee_code ||
                            (m.username ? "" : "—")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                      {ROLE_LABELS[m.role] || m.role}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {m.department || m.profile?.branch || "—"}
                  </td>
                  <td className="px-6 py-3">
                    <p className="text-slate-600">{m.email}</p>
                    <p className="text-xs text-slate-400">{m.profile?.phone || "—"}</p>
                  </td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => toggleStatus(m)}
                      disabled={busyId === m.id}
                      title={m.is_active ? "Click to disable" : "Click to enable"}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold transition disabled:opacity-50 ${
                        m.is_active
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                      }`}
                    >
                      {m.is_active ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditing(m)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                      >
                        <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {/* The replacement for an admin-set password: the way
                          to help somebody who never got their email or is
                          locked out. Hidden for a disabled account, which the
                          server refuses anyway — mailing working credentials
                          to somebody whose access was withdrawn is the
                          opposite of what disabling it meant. */}
                      {m.is_active && (
                        <button
                          onClick={() => setResending(m)}
                          disabled={busyId === m.id}
                          title="Email new sign-in details — the current password stops working"
                          className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
                        >
                          <HiOutlineEnvelope className="h-3.5 w-3.5" />
                          Resend
                        </button>
                      )}
                      {/* Deletion is offered only when nothing depends on the
                          account. The server refuses regardless — this just
                          avoids presenting an action that always fails. */}
                      {!m.has_records && (
                        <button
                          onClick={() => setConfirming(m)}
                          disabled={busyId === m.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          <HiOutlineTrash className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <StaffFormModal
          staff={editing === "new" ? null : editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            // Only a creation hands anything back; an edit resolves undefined
            // and must not clear a notice the admin is still reading.
            if (created?.credentials) setNotice(created);
            load(true);
          }}
        />
      )}

      {resending && (
        <ConfirmDialog
          title={`Email new sign-in details to ${resending.name}?`}
          message={`A new temporary password and a single-use link will be sent to ${resending.email}. Their current password stops working immediately, as does any link already sent to them.`}
          confirmLabel="Send new details"
          busy={busyId === resending.id}
          onCancel={() => setResending(null)}
          onConfirm={() => resend(resending)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={`Delete ${confirming.name}?`}
          message="This permanently removes the account and cannot be undone. Disabling it instead keeps the record and blocks sign-in."
          confirmLabel="Delete permanently"
          onCancel={() => setConfirming(null)}
          onConfirm={() => remove(confirming)}
        />
      )}
    </div>
  );
}
