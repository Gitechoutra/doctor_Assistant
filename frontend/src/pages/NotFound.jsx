import { Link, useLocation } from "react-router-dom";
import { HiOutlineArrowLeft, HiOutlineMagnifyingGlass } from "react-icons/hi2";
import { useAuth } from "../context/AuthContext";

/**
 * Where an unmatched URL lands.
 *
 * The "back to" link is chosen by role rather than hard-coded to /dashboard:
 * a nurse or pharmacist sent there is immediately redirected out again by
 * their layout, which reads as the app bouncing them around.
 */
const HOME_BY_ROLE = {
  nurse: { to: "/nurse", label: "Back to the nursing station" },
  pharmacist: { to: "/pharmacy", label: "Back to the pharmacy counter" },
};

export default function NotFound() {
  const { pathname } = useLocation();
  const { isAuthenticated, user } = useAuth();

  const home = isAuthenticated
    ? HOME_BY_ROLE[user?.role] || { to: "/dashboard", label: "Back to the dashboard" }
    : { to: "/", label: "Back to the home page" };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600">
          <HiOutlineMagnifyingGlass className="h-6 w-6" />
        </div>

        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-400">
          404
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
          This page doesn&apos;t exist
        </h1>
        <p className="mt-2 break-all text-sm text-slate-500">
          Nothing is served at <span className="font-medium text-slate-600">{pathname}</span>.
          It may have moved, or the link may be out of date.
        </p>

        <Link
          to={home.to}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
        >
          <HiOutlineArrowLeft className="h-4 w-4" />
          {home.label}
        </Link>
      </div>
    </div>
  );
}
