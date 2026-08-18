import { useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineArrowLeft, HiOutlineCheckCircle } from "react-icons/hi2";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { MIN_PASSWORD, changePassword, requestPasswordReset } from "../services/authService";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function Security() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // For someone who knows their current password. Someone who doesn't uses
  // the reset link below instead — this form can't help them, since it
  // exists to confirm they already have it.
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleForgotPassword() {
    setSendingReset(true);
    setErrorMsg("");
    try {
      // Already signed in, so the account is known — no need to make them
      // retype their email the way the signed-out /forgot-password page does.
      await requestPasswordReset(user?.email || user?.username);
      setResetSent(true);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not send that request. Please try again."
      );
    } finally {
      setSendingReset(false);
    }
  }

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
      {/* Not a sidebar entry — you arrive here from Settings — so the way
          back has to be on the page itself. */}
      <Link
        to="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
      >
        <HiOutlineArrowLeft className="h-4 w-4" />
        Settings
      </Link>
      <h1 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">Privacy & Security</h1>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Change Password</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-600">
                Current Password
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={sendingReset || resetSent}
                className="text-xs font-semibold text-brand-600 transition hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingReset ? "Sending…" : "Forgot password?"}
              </button>
            </div>
            <PasswordInput
              required
              autoComplete="current-password"
              className={inputClass}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            {resetSent && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600">
                <HiOutlineCheckCircle className="h-4 w-4 shrink-0" />
                If that address is on file, a reset link is on its way — it expires
                shortly, so use it as soon as it arrives.
              </p>
            )}
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
