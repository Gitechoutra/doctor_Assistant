import { useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "../components/Avatar";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { MIN_PASSWORD, changePassword } from "../services/authService";

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value || "—"}</p>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  // This page is entirely account-level, so it serves the nursing module too —
  // only the cross-link has to know which shell it's rendered inside.
  const home = user?.role === "nurse" ? "/nurse" : "/dashboard";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (newPassword !== confirmPassword) {
      setErrorMsg("New password and confirmation don't match.");
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccessMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Settings</h1>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">Account</h2>
          <Link
            to={`${home}/profile`}
            className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
          >
            Edit profile →
          </Link>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Avatar name={user?.name} imageUrl={user?.avatar_url} size="lg" />
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" value={user?.name} />
            {/* The name they sign in with. Issued by the hospital and mailed
                to them once, which makes "what was my username again?" a
                question this page should answer. */}
            <Field label="Username" value={user?.username} />
            <Field label="Email" value={user?.email} />
            <Field label="Role" value={user?.role} />
            {user?.department && <Field label="Department" value={user.department} />}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Change Password</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Current Password
            </label>
            <PasswordInput
              required
              autoComplete="current-password"
              className={inputClass}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              New Password
            </label>
            <PasswordInput
              required
              // Matches MIN_PASSWORD on the server. Kept in step deliberately:
              // a form that accepts seven characters and an API that rejects
              // them makes the user find out by failing.
              minLength={MIN_PASSWORD}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              autoComplete="new-password"
              className={inputClass}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Confirm New Password
            </label>
            <PasswordInput
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              className={inputClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          {successMsg && <p className="text-sm text-emerald-600">{successMsg}</p>}

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
          >
            {saving ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
