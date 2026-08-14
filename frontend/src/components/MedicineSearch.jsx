import { useEffect, useRef, useState } from "react";
import {
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import { searchMedicines } from "../services/prescriptionService";

/**
 * Type-ahead over the practice's medicine catalogue, with a + to add one.
 *
 * The list is the practice's own formulary. Picking from it rather than
 * typing is what keeps a prescription line resolvable — to a generic, to a
 * stored precedent, and to the same medicine next time.
 *
 * `alreadyAdded` are brand ids on the prescription; those rows stay visible
 * but show as added rather than disappearing, so a doctor who searches for
 * something twice is told why it isn't offered instead of doubting the search.
 */
export default function MedicineSearch({ alreadyAdded = [], onAdd }) {
  const [term, setTerm] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const containerRef = useRef(null);

  // Debounced: a doctor types a medicine name at speed, and firing per
  // keystroke would put the answer for "dol" on screen after the one for "d".
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      searchMedicines(term)
        .then((data) => {
          if (cancelled) return;
          setItems(data.items || []);
          setErrorMsg("");
        })
        .catch(() => !cancelled && setErrorMsg("Could not search medicines."))
        .finally(() => !cancelled && setLoading(false));
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  // Clicking anywhere else closes the dropdown — otherwise it hangs over the
  // rows the doctor just went to edit.
  useEffect(() => {
    function onPointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function handleAdd(medicine) {
    onAdd(medicine);
    setTerm("");
    // Stays open: adding several medicines in a row is the normal case, and
    // reopening the picker each time would be four extra clicks.
    setOpen(true);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
        <HiOutlineMagnifyingGlass className="h-4.5 w-4.5 shrink-0 text-slate-400" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search medicines — name, generic or condition…"
          aria-label="Search medicines"
          className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label="Clear"
            className="shrink-0 text-slate-400 transition hover:text-slate-600"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {errorMsg ? (
            <p className="px-4 py-3 text-sm text-red-600">{errorMsg}</p>
          ) : loading && items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">Searching…</p>
          ) : items.length === 0 ? (
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-slate-600">
                No medicine matches &ldquo;{term}&rdquo;.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Only medicines in the practice's catalogue appear here. Use Add custom
                medicine to prescribe something that is not in it.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {items.map((m) => {
                const added = alreadyAdded.includes(m.brand_id);
                return (
                  <li
                    key={m.brand_id}
                    className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-800">{m.name}</p>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          {m.form_label}
                        </span>
                        {m.strength && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            {m.strength}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-400">
                        {m.generic_name || "—"}
                        {m.category ? ` · ${m.category}` : ""}
                      </p>
                      {m.used_for && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          {m.used_for}
                        </p>
                      )}
                    </div>

                    {added ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAdd(m)}
                        aria-label={`Add ${m.name} to the prescription`}
                        title={`Add ${m.name}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition hover:bg-brand-100"
                      >
                        <HiOutlinePlus className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
