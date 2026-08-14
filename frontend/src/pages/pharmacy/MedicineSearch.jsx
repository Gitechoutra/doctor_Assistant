import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiOutlineArrowPath,
  HiOutlineBuildingOffice2,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
} from "react-icons/hi2";
import { searchMedicines } from "../../services/pharmacyService";

/**
 * The counter's main tool: is this medicine here, and if not, who has it?
 *
 * Two result blocks on purpose. The first answers "can I dispense this now";
 * the second only appears when the answer is no, and says which branch to
 * call. Merging them would bury the one fact the pharmacist needs.
 */
function StockPill({ quantity, low }) {
  if (quantity <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        Out of stock
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
        low ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {quantity} in stock{low ? " · low" : ""}
    </span>
  );
}

export default function MedicineSearch() {
  const [term, setTerm] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const debounceRef = useRef(null);

  const run = useCallback((q) => {
    if (q.trim().length < 2) {
      setResult(null);
      setErrorMsg("");
      return;
    }
    setLoading(true);
    searchMedicines(q.trim())
      .then((data) => {
        setResult(data);
        setErrorMsg("");
      })
      .catch((err) => setErrorMsg(err.response?.data?.message || "Search failed."))
      .finally(() => setLoading(false));
  }, []);

  // Debounced: a pharmacist types a brand name quickly, and one request per
  // keystroke would be both slow and pointless.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(term), 300);
    return () => clearTimeout(debounceRef.current);
  }, [term, run]);

  const hasResults = result && result.in_branch.length > 0;

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Search medicines</h1>
      <p className="mt-1 text-sm text-slate-500">
        By brand, generic name, category — or by what it treats, like
        &ldquo;fever&rdquo; or &ldquo;allergy&rdquo;.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
        <HiOutlineMagnifyingGlass className="h-5 w-5 shrink-0 text-slate-400" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="e.g. Dolo, Azithromycin, antibiotic, fever…"
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {loading && <HiOutlineArrowPath className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {!result && !loading && (
        <p className="mt-10 text-center text-sm text-slate-400">
          Type at least two characters to search.
        </p>
      )}

      {result && !hasResults && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
          <p className="text-sm font-medium text-slate-600">
            Nothing in the catalogue matches &ldquo;{result.query}&rdquo;.
          </p>
          <p className="mt-1 text-sm text-slate-400">
            If it is a new product, add it under Medicines → Add Medicine.
          </p>
        </div>
      )}

      {hasResults && (
        <>
          <div className="mt-8 flex items-center gap-2">
            <HiOutlineCheckCircle className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-900">
              At {result.branch.name}
            </h2>
            <span className="text-xs text-slate-400">
              {result.available_here} of {result.in_branch.length} available
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {result.in_branch.map((m) => (
              <article
                key={m.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${
                  m.quantity > 0 ? "border-slate-100" : "border-red-100 bg-red-50/30"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{m.display_name}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {m.form_label}
                      </span>
                      {m.category && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                          {m.category}
                        </span>
                      )}
                    </div>
                    {m.generic_name && (
                      <p className="mt-1 text-xs text-slate-500">{m.generic_name}</p>
                    )}
                    {m.used_for && (
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                        <span className="font-semibold text-slate-700">Used for: </span>
                        {m.used_for}
                      </p>
                    )}
                  </div>
                  <StockPill quantity={m.quantity} low={m.low_stock} />
                </div>

                {m.batches?.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full min-w-[26rem] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-slate-400">
                          <th className="px-3 py-2 font-medium">Batch</th>
                          <th className="px-3 py-2 font-medium">Expiry</th>
                          <th className="px-3 py-2 font-medium">Qty</th>
                          <th className="px-3 py-2 font-medium">MRP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.batches.map((b) => (
                          <tr key={b.id} className="border-b border-slate-50 last:border-0">
                            <td className="px-3 py-2 font-medium text-slate-700">
                              {b.batch_no || "—"}
                            </td>
                            <td className="px-3 py-2 text-slate-500">
                              {b.expiry_date || "—"}
                              {b.days_to_expiry != null && b.days_to_expiry < 60 && (
                                <span className="ml-1.5 font-semibold text-amber-600">
                                  {b.days_to_expiry}d
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-800">
                              {b.quantity}
                            </td>
                            <td className="px-3 py-2 text-slate-500">
                              {b.mrp != null ? `₹${b.mrp}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {result?.other_branches?.length > 0 && (
        <>
          <div className="mt-10 flex items-center gap-2">
            <HiOutlineBuildingOffice2 className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-semibold text-slate-900">
              Available at other branches
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Not on this shelf — these branches hold it and can transfer it in.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {result.other_branches.map((o, i) => (
              <div
                key={`${o.brand_id}-${o.branch?.id}-${i}`}
                className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{o.brand_name}</p>
                    {o.generic_name && (
                      <p className="mt-0.5 text-xs text-slate-500">{o.generic_name}</p>
                    )}
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                      <HiOutlineBuildingOffice2 className="h-4 w-4" />
                      {o.branch?.name}
                      {o.branch?.city ? ` · ${o.branch.city}` : ""}
                    </p>
                    {o.branch?.phone && (
                      <a
                        href={`tel:${o.branch.phone.replace(/\s+/g, "")}`}
                        className="mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        {o.branch.phone}
                      </a>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700 shadow-sm">
                    {o.quantity} units
                  </span>
                </div>
                {o.expiry_date && (
                  <p className="mt-3 text-[11px] text-slate-500">
                    Batch {o.batch_no || "—"} · expires {o.expiry_date}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {hasResults && result.available_here === 0 && result.other_branches.length === 0 && (
        <p className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
          <HiOutlineExclamationTriangle className="h-5 w-5" />
          Out of stock everywhere — this needs a purchase order.
        </p>
      )}
    </div>
  );
}
