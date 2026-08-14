import { useEffect, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { fetchExpiring, fetchLowStock } from "../../services/pharmacyService";

/**
 * Low Stock and Expired Medicines.
 *
 * One component for both because they are the same shape of question — "what
 * on this shelf needs attention" — and splitting them would duplicate the
 * loading, empty and error handling for no gain.
 */
export default function StockAlerts({ mode = "low" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    const request = mode === "low" ? fetchLowStock() : fetchExpiring();
    request
      .then((d) => {
        setData(d);
        setErrorMsg("");
      })
      .catch((err) => setErrorMsg(err.response?.data?.message || "Could not load this list."))
      .finally(() => setLoading(false));
  }, [mode]);

  const isLow = mode === "low";

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (errorMsg) {
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>;
  }

  const items = isLow ? data?.items || [] : [];
  const expired = data?.expired || [];
  const soon = data?.expiring_soon || [];
  const empty = isLow ? items.length === 0 : expired.length + soon.length === 0;

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
        {isLow ? "Low stock" : "Expired medicines"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {isLow
          ? "At or below the reorder level in this branch — out of stock first."
          : `Already expired, plus batches expiring within ${data?.horizon_days ?? 60} days.`}
      </p>

      {empty ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <HiOutlineCheckCircle className="mx-auto h-9 w-9 text-emerald-400" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            {isLow ? "Everything is above its reorder level." : "Nothing expired or expiring soon."}
          </p>
        </div>
      ) : isLow ? (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Medicine</th>
                <th className="px-6 py-3 font-medium">In stock</th>
                <th className="px-6 py-3 font-medium">Reorder at</th>
                <th className="px-6 py-3 font-medium">Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-6 py-3">
                    <p className="font-semibold text-slate-800">{r.display_name}</p>
                    <p className="text-xs text-slate-400">{r.category || "—"}</p>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        r.quantity === 0
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-500">{r.reorder_level}</td>
                  <td className="px-6 py-3 font-semibold text-slate-700">{r.shortfall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {[
            ["Expired — remove from the shelf", expired, "red"],
            ["Expiring soon", soon, "amber"],
          ].map(([heading, rows, tone]) =>
            rows.length === 0 ? null : (
              <div key={heading}>
                <h2
                  className={`flex items-center gap-2 text-sm font-bold ${
                    tone === "red" ? "text-red-700" : "text-amber-700"
                  }`}
                >
                  <HiOutlineExclamationTriangle className="h-4 w-4" />
                  {heading} ({rows.length})
                </h2>
                <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-6 py-3 font-medium">Medicine</th>
                        <th className="px-6 py-3 font-medium">Batch</th>
                        <th className="px-6 py-3 font-medium">Expiry</th>
                        <th className="px-6 py-3 font-medium">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => (
                        <tr key={b.id} className="border-b border-slate-50 last:border-0">
                          <td className="px-6 py-3 font-semibold text-slate-800">
                            {b.brand_name}
                          </td>
                          <td className="px-6 py-3 text-slate-500">{b.batch_no || "—"}</td>
                          <td className="px-6 py-3">
                            <span
                              className={`font-semibold ${
                                tone === "red" ? "text-red-600" : "text-amber-600"
                              }`}
                            >
                              {b.expiry_date}
                            </span>
                            {b.days_to_expiry != null && b.days_to_expiry >= 0 && (
                              <span className="ml-1.5 text-xs text-slate-400">
                                in {b.days_to_expiry}d
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 font-semibold text-slate-700">{b.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
