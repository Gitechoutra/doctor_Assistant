import { NavLink, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineBellAlert,
  HiOutlineCalendarDays,
  HiOutlineSquares2X2,
  HiOutlineUserCircle,
  HiOutlineUsers,
} from "react-icons/hi2";
import Logo from "../Logo";
import { useAuth } from "../../context/AuthContext";

// Deliberately short. A nurse's whole job in this app is the patients handed
// to them, so there is nothing else to navigate to — the doctor module's
// org-structure screens would only be dead ends.
const NAV_ITEMS = [
  { to: "/nurse", label: "Dashboard", icon: HiOutlineSquares2X2, end: true },
  { to: "/nurse/patients", label: "My Patients", icon: HiOutlineUsers },
  { to: "/nurse/alerts", label: "Alerts", icon: HiOutlineBellAlert },
  // Read-only. A nurse sees the shifts the administrator scheduled them
  // for and nobody else's.
  { to: "/nurse/shifts", label: "My Shifts", icon: HiOutlineCalendarDays },
  { to: "/nurse/profile", label: "Profile", icon: HiOutlineUserCircle },
];

export default function NurseSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6">
      <Logo className="px-2" />

      <div className="mt-6 rounded-xl bg-teal-50 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">
          Nursing
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{user?.name}</p>
        {/* No shift here any more. This showed the single "normal" shift on
            the nurse profile, which was seeded rather than scheduled and so was
            wrong as often as it was right. The real shift schedule lives on My Shifts. */}
        <p className="truncate text-xs text-slate-500">{user?.department || "Ward staff"}</p>
      </div>

      <nav className="mt-6 flex-1 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
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
