import { useEffect, useState } from "react";
import { HiOutlineTag } from "react-icons/hi2";
import { fetchCategories } from "../../services/pharmacyService";

export default function Categories() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Categories</h1>

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">
          No categories yet — they appear as medicines are added.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <div
              key={c.category}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <HiOutlineTag className="h-4.5 w-4.5" />
                </span>
                <p className="font-bold text-slate-900">{c.category}</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-extrabold text-slate-900">{c.brand_count}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Brands</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold text-slate-900">{c.units_in_stock}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Units</p>
                </div>
                <div>
                  <p
                    className={`text-lg font-extrabold ${
                      c.out_of_stock ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {c.out_of_stock}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Out</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
