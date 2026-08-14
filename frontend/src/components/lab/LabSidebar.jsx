import { NavLink, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineBeaker,
  HiOutlineCalendarDays,
  HiOutlineCog6Tooth,
  HiOutlineSquares2X2,
  HiOutlineUserCircle,
} from "react-icons/hi2";
import Logo from "../Logo";
import { useAuth } from "../../context/AuthContext";

// Deliberately short, for the same reason the nursing sidebar is: a lab
// technician's work in this application is the tests handed to them. The
// clinical and org-structure screens would be dead ends — the API 403s every
// one of them for this role.
const NAV_ITEMS = [
  { to: "/lab", label: "Dashboard", icon: HiOutlineSquares2X2, end: true },
  { to: "/lab/requests", label: "Test Worklist", icon: HiOutlineBeaker },
  { to: "/lab/shifts", label: "My Shifts", icon: HiOutlineCalendarDays },
  { to: "/lab/profile", label: "Profile", icon: HiOutlineUserCircle },
  { to: "/lab/settings", label: "Settings", icon: HiOutlineCog6Tooth },
];

export default function LabSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6">
      <Logo className="px-2" />

      <div className="mt-6 rounded-xl bg-indigo-50 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Laboratory
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{user?.name}</p>
        <p className="truncate text-xs text-slate-500">{user?.department || "Lab staff"}</p>
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
                  ? "bg-indigo-50 text-indigo-700"
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
