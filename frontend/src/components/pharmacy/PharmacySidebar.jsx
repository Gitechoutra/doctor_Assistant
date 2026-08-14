import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  HiOutlineArchiveBox,
  HiOutlineArrowRightOnRectangle,
  HiOutlineBanknotes,
  HiOutlineBell,
  HiOutlineCalendarDays,
  HiOutlineChevronDown,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentChartBar,
  HiOutlineShoppingCart,
  HiOutlineSquares2X2,
  HiOutlineTruck,
  HiOutlineUserCircle,
} from "react-icons/hi2";
import Logo from "../Logo";
import { useAuth } from "../../context/AuthContext";

/**
 * The pharmacy counter's navigation.
 *
 * The full structure is shown, including the sections that are not built yet —
 * hiding them would misrepresent the roadmap, and a pharmacist looking for
 * "Billing" should find out it is coming rather than assume it is missing.
 * `ready: false` renders a "Soon" chip and routes to a placeholder that says
 * plainly what does and doesn't work.
 */
const NAV = [
  { to: "/pharmacy", label: "Dashboard", icon: HiOutlineSquares2X2, end: true, ready: true },
  {
    label: "Prescriptions",
    icon: HiOutlineClipboardDocumentList,
    children: [
      { to: "/pharmacy/prescriptions/pending", label: "Pending" },
      { to: "/pharmacy/prescriptions/dispensed", label: "Dispensed" },
      { to: "/pharmacy/prescriptions/history", label: "History" },
    ],
  },
  {
    label: "Medicines",
    icon: HiOutlineArchiveBox,
    children: [
      { to: "/pharmacy/medicines/departments", label: "Departments", ready: true },
      { to: "/pharmacy/medicines/inventory", label: "All Medicines", ready: true },
      { to: "/pharmacy/medicines/add", label: "Add Medicine", ready: true },
      { to: "/pharmacy/medicines/categories", label: "Categories", ready: true },
      { to: "/pharmacy/medicines/search", label: "Search", ready: true },
      { to: "/pharmacy/medicines/requests", label: "Doctor Requests", ready: true },
    ],
  },
  {
    label: "Purchases",
    icon: HiOutlineTruck,
    children: [
      { to: "/pharmacy/purchases/orders", label: "Purchase Orders" },
      { to: "/pharmacy/purchases/suppliers", label: "Suppliers" },
      { to: "/pharmacy/purchases/received", label: "Stock Received" },
    ],
  },
  {
    label: "Billing",
    icon: HiOutlineBanknotes,
    children: [
      { to: "/pharmacy/billing/new", label: "New Bill" },
      { to: "/pharmacy/billing/transactions", label: "Transactions" },
      { to: "/pharmacy/billing/refunds", label: "Refunds" },
    ],
  },
  {
    label: "Stock",
    icon: HiOutlineShoppingCart,
    children: [
      { to: "/pharmacy/stock/in", label: "Stock In", ready: true },
      { to: "/pharmacy/stock/out", label: "Stock Out" },
      { to: "/pharmacy/stock/low", label: "Low Stock", ready: true },
      { to: "/pharmacy/stock/expired", label: "Expired Medicines", ready: true },
      { to: "/pharmacy/stock/damaged", label: "Damaged Medicines" },
    ],
  },
  {
    label: "Reports",
    icon: HiOutlineDocumentChartBar,
    children: [
      { to: "/pharmacy/reports/sales", label: "Sales" },
      { to: "/pharmacy/reports/purchases", label: "Purchases" },
      { to: "/pharmacy/reports/inventory", label: "Inventory" },
      { to: "/pharmacy/reports/profit-loss", label: "Profit & Loss" },
      { to: "/pharmacy/reports/gst", label: "GST" },
    ],
  },
  // Read-only, same as every other non-admin role.
  { to: "/pharmacy/shifts", label: "My Shifts", icon: HiOutlineCalendarDays, ready: true },
  { to: "/pharmacy/notifications", label: "Notifications", icon: HiOutlineBell, ready: true },
  { to: "/pharmacy/profile", label: "Profile", icon: HiOutlineUserCircle, ready: true },
];

const linkClass = ({ isActive }) =>
  `flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition ${
    isActive
      ? "bg-emerald-50 font-semibold text-emerald-700"
      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
  }`;

function SoonChip() {
  return (
    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
      Soon
    </span>
  );
}

function Section({ item }) {
  const [open, setOpen] = useState(item.label === "Medicines");
  const Icon = item.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <Icon className="h-5 w-5" />
        <span className="flex-1 text-left">{item.label}</span>
        <HiOutlineChevronDown
          className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="ml-4 space-y-0.5 border-l border-slate-100 pl-3">
          {item.children.map((child) => (
            <NavLink key={child.to} to={child.to} className={linkClass}>
              <span>{child.label}</span>
              {!child.ready && <SoonChip />}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PharmacySidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6">
      <Logo />

      <div className="mt-6 rounded-xl bg-emerald-50 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
          Pharmacy
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{user?.name}</p>
        <p className="truncate text-xs text-slate-500">{user?.branch || "No branch set"}</p>
      </div>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto pr-1">
        {NAV.map((item) =>
          item.children ? (
            <Section key={item.label} item={item} />
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              <span className="flex items-center gap-3">
                <item.icon className="h-5 w-5" />
                {item.label}
              </span>
              {!item.ready && <SoonChip />}
            </NavLink>
          )
        )}
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
