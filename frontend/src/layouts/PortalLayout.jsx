import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineCalendarDays,
  HiOutlineClipboardDocumentList,
  HiOutlineUserCircle,
} from "react-icons/hi2";
import Logo from "../components/Logo";
import { PortalAuthProvider, usePortalAuth } from "../context/PortalAuthContext";

/**
 * The patient's shell — and the guard that decides whether they see it.
 *
 * Nothing like `DashboardLayout`: a patient has three places to be, not
 * eleven, so this is a top bar with three tabs rather than a sidebar. The
 * practice's own navigation is deliberately not reachable from here at all.
 */

const TABS = [
  { to: "/portal/appointments", label: "Appointments", icon: HiOutlineCalendarDays, end: true },
  { to: "/portal/history", label: "Past visits", icon: HiOutlineClipboardDocumentList },
  { to: "/portal/profile", label: "My details", icon: HiOutlineUserCircle },
];

function PortalChrome() {
  const { patient, isAuthenticated, logout } = usePortalAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Where they were headed, so a bookmarked page survives an expired
    // session — same contract as the staff `ProtectedRoute`.
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{patient?.name}</p>
              <p className="text-xs text-slate-400">{patient?.code}</p>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <HiOutlineArrowRightOnRectangle className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-10 text-center text-xs text-slate-400 sm:px-6">
        <p>
          {patient?.practice_name || "Your practice"} — for anything urgent, please
          telephone the practice rather than using this page.
        </p>
      </footer>
    </div>
  );
}

/** Wraps the whole portal in its own auth provider, so the practice's
 *  `AuthProvider` and this one never see each other's session. */
export default function PortalLayout() {
  return (
    <PortalAuthProvider>
      <PortalChrome />
    </PortalAuthProvider>
  );
}

/** The sign-in and registration screens: same provider, no guard — they are
 *  what somebody with no session is sent to. */
export function PortalPublicLayout() {
  return (
    <PortalAuthProvider>
      <Outlet />
    </PortalAuthProvider>
  );
}
