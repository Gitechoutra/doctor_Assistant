import { Link } from "react-router-dom";

/**
 * A dashboard metric. Pass `to` to make the whole card a link through to the
 * page that lists what it counted; without it the card is static.
 *
 * Every card in a row is the same height and puts its number on the same
 * baseline, whether or not it has a hint and however long its label wraps:
 * `h-full` takes the height the grid row stretches to, and the hint keeps its
 * two-line box even when empty. Without that, one card with a wrapping label
 * pushed its neighbour's number out of line.
 */
export default function StatCard({ label, value, hint, icon: Icon, to }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 transition group-hover:bg-brand-100">
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
      </div>
      {/* tabular-nums keeps a row of counts optically aligned as they tick
          over — otherwise a 1 makes its card's number visibly narrower. */}
      <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{value ?? "—"}</p>
      <p className="mt-1 line-clamp-2 min-h-8 text-xs text-slate-400">{hint}</p>
    </>
  );

  const base =
    "flex h-full min-h-32 flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm";

  if (!to) {
    return <div className={base}>{body}</div>;
  }

  return (
    <Link
      to={to}
      className={`group text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${base}`}
    >
      {body}
    </Link>
  );
}
