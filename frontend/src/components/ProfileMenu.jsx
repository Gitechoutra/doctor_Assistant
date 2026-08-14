import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineCamera,
  HiOutlineChevronDown,
  HiOutlineCog6Tooth,
  HiOutlineUserCircle,
} from "react-icons/hi2";
import Avatar from "./Avatar";
import useDismissable from "../hooks/useDismissable";
import { useAuth } from "../context/AuthContext";

export default function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);
  useDismissable(containerRef, isOpen, close);

  function go(path) {
    close();
    navigate(path);
  }

  // Nurses live under /nurse, everyone else under /dashboard. The same menu
  // serves both rather than each module growing its own copy. Signing out
  // always returns to the one login page — there is no separate nurse portal.
  const isNurse = user?.role === "nurse";
  const home =
    isNurse ? "/nurse" : user?.role === "pharmacist" ? "/pharmacy" : "/dashboard";

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  const items = [
    { label: "My Profile", icon: HiOutlineUserCircle, onClick: () => go(`${home}/profile`) },
    {
      label: "Change profile picture",
      icon: HiOutlineCamera,
      // The profile page reads this flag and opens its file picker on arrival.
      onClick: () => go(`${home}/profile?avatar=1`),
    },
    { label: "Settings", icon: HiOutlineCog6Tooth, onClick: () => go(`${home}/settings`) },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={isOpen}
        className={`flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition hover:bg-slate-50 ${
          isOpen ? "bg-slate-100" : ""
        }`}
      >
        <Avatar name={user?.name} imageUrl={user?.avatar_url} size="md" />
        <HiOutlineChevronDown
          className={`h-4 w-4 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-900/10">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <Avatar name={user?.name} imageUrl={user?.avatar_url} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
              {user?.role && (
                <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                  {user.role}
                </span>
              )}
            </div>
          </div>

          <div className="py-1">
            {items.map(({ label, icon: Icon, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <Icon className="h-4.5 w-4.5 text-slate-400" />
                {label}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 py-1">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
            >
              <HiOutlineArrowRightOnRectangle className="h-4.5 w-4.5" />
              {loggingOut ? "Signing out…" : "Logout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
