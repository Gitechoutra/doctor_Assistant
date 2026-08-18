import { useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineBell,
  HiOutlineChevronRight,
  HiOutlineShieldCheck,
  HiOutlineUserCircle,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { updateProfile } from "../services/authService";

function MenuRow({ to, icon: Icon, label, description, right, onClick }) {
  const content = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      {right ?? <HiOutlineChevronRight className="h-4.5 w-4.5 shrink-0 text-slate-300" />}
    </>
  );

  const className =
    "flex w-full items-center gap-3.5 px-5 py-4 text-left transition hover:bg-slate-50";

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * The Settings landing screen: a menu of where account-level things live,
 * not the things themselves. Edit Profile, Privacy & Security and
 * Notifications each got busy enough on their own — a name change, a
 * specialization, a password, a preference — that stacking them on one page
 * meant scrolling past two of them to reach the third. This page just says
 * where each one is.
 */
export default function Settings() {
  const { user, updateUser } = useAuth();
  // This page is entirely account-level, and one workspace serves both roles —
  // only the cross-link has to know which shell it's rendered inside.
  const home = "/dashboard";

  const [togglingNotifications, setTogglingNotifications] = useState(false);

  async function handleNotificationsToggle() {
    const next = !user?.notifications_enabled;
    setTogglingNotifications(true);
    try {
      updateUser(await updateProfile({ notifications_enabled: next }));
    } catch {
      // Left as-is: the toggle below still reflects the last confirmed
      // state, so a failed request just looks like nothing happened.
    } finally {
      setTogglingNotifications(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Settings</h1>

      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <Avatar name={user?.name} imageUrl={user?.avatar_url} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          {user?.role_label && (
            <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
              {user.role_label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <MenuRow
          to={`${home}/profile`}
          icon={HiOutlineUserCircle}
          label="Edit Profile"
          description="Name, photo, and practice details"
        />
        <MenuRow
          to={`${home}/settings/security`}
          icon={HiOutlineShieldCheck}
          label="Privacy & Security"
          description="Change your password"
        />
        <MenuRow
          icon={HiOutlineBell}
          label="Notifications"
          description={user?.notifications_enabled ? "On" : "Off"}
          onClick={handleNotificationsToggle}
          right={
            <span
              aria-hidden="true"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                user?.notifications_enabled ? "bg-brand-600" : "bg-slate-200"
              } ${togglingNotifications ? "opacity-60" : ""}`}
            >
              <span
                className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition ${
                  user?.notifications_enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          }
        />
      </div>
    </div>
  );
}
