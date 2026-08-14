import { HiOutlineWrenchScrewdriver } from "react-icons/hi2";
import { Link } from "react-router-dom";

/**
 * Placeholder for the sections that are mapped out but not built.
 *
 * Deliberately explicit about what is missing rather than showing an empty
 * table that looks broken — and it points at the screens that do work, so a
 * pharmacist who lands here has somewhere to go.
 */
export default function PharmacySoon({ title, blurb, needs = [] }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          <HiOutlineWrenchScrewdriver className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          {blurb || "This section is mapped out but not built yet."}
        </p>

        {needs.length > 0 && (
          <div className="mx-auto mt-6 max-w-md rounded-xl bg-slate-50 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              What it still needs
            </p>
            <ul className="mt-2 space-y-1.5">
              {needs.map((n) => (
                <li key={n} className="flex gap-2 text-sm text-slate-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            to="/pharmacy/medicines/search"
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            Search medicines
          </Link>
          <Link
            to="/pharmacy/medicines/inventory"
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View inventory
          </Link>
        </div>
      </div>
    </div>
  );
}
