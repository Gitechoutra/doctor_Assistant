import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineBuildingOffice2,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
} from "react-icons/hi2";
import { fetchDepartmentInventory } from "../../services/pharmacyService";

function DepartmentCard({ department }) {
  const needsAttention = department.out_of_stock > 0 || department.low_stock > 0;

  return (
    <Link
      to={`/pharmacy/medicines/inventory?department_id=${department.id}`}
      className="group block rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{department.name}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {department.own_medicine_count} own
            {department.shared_medicine_count > 0 &&
              ` · ${department.shared_medicine_count} shared`}
          </p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-100">
          <HiOutlineBuildingOffice2 className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-4 text-3xl font-bold text-slate-900">{department.medicine_count}</p>
      <p className="text-xs text-slate-500">
        medicine{department.medicine_count === 1 ? "" : "s"} · {department.units_in_branch} units
        here
      </p>

      {needsAttention && (
        <div className="mt-3 flex flex-wrap gap-2">
          {department.out_of_stock > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              <HiOutlineExclamationTriangle className="h-3.5 w-3.5" />
              {department.out_of_stock} out of stock
            </span>
          )}
          {department.low_stock > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              {department.low_stock} low
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

/**
 * The department-wise view of the pharmacy: every department, how many
 * medicines it stocks, and what needs attention. Clicking through opens that
 * department's own inventory.
 *
 * Counts include medicines marked "all departments", because shared stock is
 * genuinely part of each department's shelf rather than a separate pool the
 * pharmacist has to remember to check.
 */
export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return fetchDepartmentInventory()
      .then((data) => {
        setDepartments(data.departments || []);
        setErrorMsg("");
      })
      .catch((err) =>
        setErrorMsg(err.response?.data?.message || "Could not load departments.")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const needle = term.trim().toLowerCase();
  const visible = departments.filter((d) => !needle || d.name.toLowerCase().includes(needle));
  const totalMedicines = departments.reduce((sum, d) => sum + d.own_medicine_count, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Departments</h1>
          <p className="mt-1 text-sm text-slate-500">
            {departments.length} departments · {totalMedicines} medicines filed
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
          <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Find a department…"
            className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <HiOutlineBuildingOffice2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            {needle ? "No department matches that." : "No departments yet."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((d) => (
            <DepartmentCard key={d.id} department={d} />
          ))}
        </div>
      )}
    </div>
  );
}
