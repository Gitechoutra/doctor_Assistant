import { NavLink, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineCog6Tooth,
  HiOutlineDocumentChartBar,
  HiOutlineFolderOpen,
  HiOutlineIdentification,
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
 */
const PA_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: HiOutlineSquares2X2, end: true },
  { to: "/dashboard/patients", label: "Patients", icon: HiOutlineUsers },
  { to: "/dashboard/appointments", label: "Appointments", icon: HiOutlineCalendarDays },
  { to: "/dashboard/queue", label: "Patient Queue", icon: HiOutlineQueueList },
  // The practice's doctor is set up here. Not in the doctor's nav: they cannot
  // sign in until the PA has made the account, so it could never be their job.
  { to: "/dashboard/doctors", label: "Doctors", icon: HiOutlineUserPlus },
  { to: "/dashboard/reports", label: "Reports", icon: HiOutlineDocumentChartBar },
  { to: "/dashboard/profile", label: "Profile", icon: HiOutlineIdentification },
  { to: "/dashboard/settings", label: "Settings", icon: HiOutlineCog6Tooth },
];

const DOCTOR_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: HiOutlineSquares2X2, end: true },
  { to: "/dashboard/queue", label: "Patient Queue", icon: HiOutlineQueueList },
  { to: "/dashboard/patients", label: "Patients", icon: HiOutlineUsers },
  {
    to: "/dashboard/consultations",
    label: "Consultations",
    icon: HiOutlineChatBubbleLeftRight,
  },
  // A course of treatment across several visits — where a doctor picks an
  // ongoing case back up, and where a finished one gets its consolidated
  // report.
  { to: "/dashboard/cases", label: "Cases", icon: HiOutlineFolderOpen },
  {
    to: "/dashboard/prescriptions",
    label: "Prescriptions",
    icon: HiOutlineClipboardDocumentList,
  },
  { to: "/dashboard/reports", label: "Reports", icon: HiOutlineDocumentChartBar },
  { to: "/dashboard/profile", label: "Profile", icon: HiOutlineIdentification },
  { to: "/dashboard/settings", label: "Settings", icon: HiOutlineCog6Tooth },
];

export function navFor(role) {
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
