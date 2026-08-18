import { NavLink, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineCog6Tooth,
  HiOutlineQueueList,
  HiOutlineSquares2X2,
  HiOutlineUserPlus,
  HiOutlineUsers,
} from "react-icons/hi2";
import Logo from "./Logo";
import { ROLE_DOCTOR, ROLE_PA, useAuth } from "../context/AuthContext";

/**
 * The two sidebars.
 *
 * Written as two explicit lists rather than one list with per-item role
 * filters. The hospital version did it the other way — fifteen entries, each
 * carrying a `hideFrom` array — and the result was that no one screen told
 * you what a given role actually saw; you had to evaluate the filter in your
 * head. Two short lists say it outright, and each one is short enough to read
 * as the whole job.
 *
 * Every path here is a real route in AppRouter. That is the invariant worth
 * keeping: a nav entry pointing at a deleted route is a dead button, and dead
 * buttons are how a refactor like this one leaks.
 *
 * The reverse does not hold, and deliberately so. Cases and Reports are off
 * the menu for now, but their routes stay: the consultation room, a
 * prescription and a report card all link straight into a case, and those
 * links are live. Dropping the routes would break them. What changed here is
 * only what the sidebar offers as a place to start.
 *
 * Profile is off both menus for the same reason. Your own account is one
 * subject, and Settings is where it lives — the account card there carries
 * the "Edit profile" link, and the avatar menu has its own way in. A sidebar
 * entry beside it made two front doors onto one thing.
 */
const PA_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: HiOutlineSquares2X2, end: true },
  { to: "/dashboard/patients", label: "Patients", icon: HiOutlineUsers },
  { to: "/dashboard/appointments", label: "Appointments", icon: HiOutlineCalendarDays },
  { to: "/dashboard/queue", label: "Patient Queue", icon: HiOutlineQueueList },
  { to: "/dashboard/settings", label: "Settings", icon: HiOutlineCog6Tooth },
];

// Appointments is the doctor's way into the day's unfinished work — booked,
// waiting and in-consultation, with the button that calls each patient in.
// That is what Patient Queue used to be for them, so the queue is no longer
// offered here as a second door onto the same rows. Its route stays: the
// "patient is waiting" notification links straight at it (see
// helpers/queue_helper), and the PA still works from the board itself.
const DOCTOR_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: HiOutlineSquares2X2, end: true },
  { to: "/dashboard/patients", label: "Patients", icon: HiOutlineUsers },
  { to: "/dashboard/appointments", label: "Appointments", icon: HiOutlineCalendarDays },
  {
    to: "/dashboard/consultations",
    label: "Consultations",
    icon: HiOutlineChatBubbleLeftRight,
  },
  {
    to: "/dashboard/prescriptions",
    label: "Prescriptions",
    icon: HiOutlineClipboardDocumentList,
  },
  // The desk's accounts are set up here. Not in the PA's nav: the doctor is
  // the seeded account and the only one who can issue credentials, so a PA
  // cannot create accounts at all — the API 403s them either way.
  { to: "/dashboard/assistants", label: "Assistants", icon: HiOutlineUserPlus },
  { to: "/dashboard/settings", label: "Settings", icon: HiOutlineCog6Tooth },
];

function navFor(role) {
  if (role === ROLE_DOCTOR) return DOCTOR_NAV;
  if (role === ROLE_PA) return PA_NAV;
  return [];
}

export default function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = navFor(user?.role);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6">
      <Logo className="px-2" />

      <nav className="mt-8 flex-1 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}
      </nav>

      <button
        onClick={handleLogout}
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
      >
        <HiOutlineArrowRightOnRectangle className="h-5 w-5" />
        Logout
      </button>
    </aside>
  );
}
