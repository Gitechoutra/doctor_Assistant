import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HiOutlineCamera, HiOutlineTrash } from "react-icons/hi2";
import Avatar from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { removeAvatar, updateProfile, uploadAvatar } from "../services/authService";
import { EMAIL_ERROR, EMAIL_HINT, isValidEmail } from "../utils/contact";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // must match the backend's limit
const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);

  const isDoctor = user?.role === "doctor";

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [specialization, setSpecialization] = useState(user?.specialization || "");
  const [registrationNo, setRegistrationNo] = useState(user?.registration_no || "");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // The topbar's "Change profile picture" entry links here with ?avatar=1 so
  // the file dialog opens straight away instead of making the user hunt for it.
  useEffect(() => {
    if (searchParams.get("avatar") === "1") {
      setSearchParams({}, { replace: true });
      fileInputRef.current?.click();
    }
  }, [searchParams, setSearchParams]);

  const isDirty =
    name !== (user?.name || "") ||
    email !== (user?.email || "") ||
    (isDoctor &&
      (specialization !== (user?.specialization || "") ||
        registrationNo !== (user?.registration_no || "")));

  function apply(updatedUser, message) {
    updateUser(updatedUser);
    setSuccessMsg(message);
    setErrorMsg("");
  }

  // This is the address the account's password-reset link is sent to, so it is
  // held to the same rule as the one an administrator typed when creating it.
  const emailInvalid = !isValidEmail(email);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    if (emailInvalid) {
      setErrorMsg(EMAIL_ERROR);
      return;
    }
    setSaving(true);
    try {
      const fields = { name: name.trim(), email: email.trim() };
      if (isDoctor) {
        fields.specialization = specialization.trim();
        fields.registration_no = registrationNo.trim();
      }
      apply(await updateProfile(fields), "Profile updated.");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the same file still fires onChange.
    e.target.value = "";
    if (!file) return;

    setErrorMsg("");
    setSuccessMsg("");

    if (file.size > MAX_AVATAR_BYTES) {
      setErrorMsg("Image must be 2 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      apply(await uploadAvatar(file), "Profile picture updated.");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not upload that image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleAvatarRemove() {
    setErrorMsg("");
    setSuccessMsg("");
    setUploading(true);
    try {
      apply(await removeAvatar(), "Profile picture removed.");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not remove your picture.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">My Profile</h1>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Profile picture</h2>
        <div className="mt-4 flex items-center gap-5">
          <Avatar name={user?.name} imageUrl={user?.avatar_url} size="xl" />
          <div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
              >
                <HiOutlineCamera className="h-4.5 w-4.5" />
                {uploading ? "Working…" : user?.avatar_url ? "Change picture" : "Upload picture"}
              </button>
              {user?.avatar_url && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  disabled={uploading}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                >
                  <HiOutlineTrash className="h-4.5 w-4.5" />
                  Remove
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">PNG, JPG, WEBP or GIF · up to 2 MB</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleAvatarChange}
          className="hidden"
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Account details</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Full name</label>
            <input
              type="text"
              required
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
            <input
              type="email"
              required
              placeholder={EMAIL_HINT}
              className={`${inputClass} ${emailInvalid ? "border-red-300" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailInvalid && <p className="mt-1 text-xs text-red-600">{EMAIL_ERROR}</p>}
          </div>

          {isDoctor && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Specialization
                </label>
                <input
                  type="text"
                  className={inputClass}
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Registration no.
                </label>
                <input
                  type="text"
                  className={inputClass}
                  value={registrationNo}
                  onChange={(e) => setRegistrationNo(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Role</label>
              {/* Read-only, and `role_label` rather than `role`: the raw slug
                  would render the PA's role as "pa". The API ignores this
                  field on PATCH /auth/me regardless. */}
              <input
                type="text"
                disabled
                className={inputClass}
                value={user?.role_label || user?.role || "—"}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Qualification</label>
              <input
                type="text"
                disabled
                className={inputClass}
                value={user?.qualification || "—"}
              />
            </div>
          </div>

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          {successMsg && <p className="text-sm text-emerald-600">{successMsg}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !isDirty}
              className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <Link
              to="/dashboard/settings"
              className="text-sm font-semibold text-brand-600 transition hover:text-brand-700"
            >
              Change password →
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
