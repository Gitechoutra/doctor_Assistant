import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiOutlineArchiveBox,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXMark,
} from "react-icons/hi2";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal from "../../components/Modal";
import MedicineForm from "../../components/pharmacy/MedicineForm";
import { FORM_OPTIONS } from "../../constants/medicines";
import { fetchDepartments } from "../../services/departmentService";
import {
  createBrand,
  deleteBrand,
  fetchBrands,
  updateBrand,
} from "../../services/pharmacyService";

const AVAILABILITY = [
  { value: "", label: "Any availability" },
  { value: "available", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
];

const AVAILABILITY_STYLE = {
  available: "bg-emerald-100 text-emerald-700",
  low_stock: "bg-amber-100 text-amber-700",
  out_of_stock: "bg-red-100 text-red-700",
  discontinued: "bg-slate-200 text-slate-600",
};

const AVAILABILITY_LABEL = {
  available: "In stock",
  low_stock: "Low",
  out_of_stock: "Out of stock",
  discontinued: "Discontinued",
};

const selectClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

/**
 * Department-wise medicine management: the pharmacy's working screen.
 *
 * Filters live in the URL so a filtered view can be shared or bookmarked, and
 * so arriving from the Departments page lands pre-filtered on that department.
 * Filtering and paging are server-side — the catalogue is the one list here
 * that grows without bound.
 */
export default function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const departmentId = searchParams.get("department_id") || "";
  const availability = searchParams.get("availability") || "";
  const form = searchParams.get("form") || "";
  const status = searchParams.get("status") || "active";
  const search = searchParams.get("search") || "";
  const page = Number(searchParams.get("page") || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [noticeMsg, setNoticeMsg] = useState("");

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => setSearchInput(search), [search]);

  useEffect(() => {
    fetchDepartments().then(setDepartments).catch(() => {});
  }, []);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = { page, page_size: 25, status };
      if (departmentId) params.department_id = departmentId;
      if (availability) params.availability = availability;
      if (form) params.form = form;
      if (search) params.search = search;
      return fetchBrands(params)
        .then((data) => {
          setRows(data.items || []);
          setMeta(data.meta || null);
          setErrorMsg("");
        })
        .catch((err) =>
          setErrorMsg(err.response?.data?.message || "Could not load the inventory.")
        )
        .finally(() => setLoading(false));
    },
    [departmentId, availability, form, status, search, page]
  );

  useEffect(() => {
    load();
  }, [load]);

  function setParam(key, value, defaultValue = "") {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    // Any filter change invalidates the page number — staying on page 4 of a
    // result set that now has one page shows an empty screen.
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  }

  async function handleCreate(payload) {
    setSaving(true);
    setFormError("");
    try {
      const created = await createBrand(payload);
      setAdding(false);
      setNoticeMsg(`${created.display_name} added to the catalogue.`);
      load(true);
    } catch (err) {
      setFormError(err.response?.data?.message || "Could not add this medicine.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(payload) {
    setSaving(true);
    setFormError("");
    try {
      const updated = await updateBrand(editing.id, payload);
      setEditing(null);
      setNoticeMsg(`${updated.display_name} updated.`);
      load(true);
    } catch (err) {
      setFormError(err.response?.data?.message || "Could not save this medicine.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      // The server archives instead of deleting when a medicine has history
      // or stock, and says which it did — surfaced verbatim so the pharmacist
      // is never told something vanished when it was only discontinued.
      const result = await deleteBrand(deleting.id);
      setDeleting(null);
      setNoticeMsg(result.message);
      load(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not delete this medicine.");
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  }

  const departmentName = departments.find(
    (d) => String(d.id) === String(departmentId)
  )?.name;
  const hasFilters = Boolean(
    departmentId || availability || form || search || status !== "active"
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {departmentName ? `${departmentName} medicines` : "Medicines"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {meta ? `${meta.total} medicine${meta.total === 1 ? "" : "s"}` : "Loading…"}
            {departmentName && " in this department, including shared stock"}
          </p>
        </div>
        <button
          onClick={() => {
            setFormError("");
            setAdding(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
        >
          <HiOutlinePlus className="h-4 w-4" />
          Add medicine
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam("search", searchInput.trim());
          }}
          className="flex flex-1 items-center gap-2"
        >
          <div className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
            <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, generic, manufacturer, category…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setParam("search", "");
                }}
                aria-label="Clear search"
                className="shrink-0 text-slate-400 transition hover:text-slate-600"
              >
                <HiOutlineXMark className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Search
          </button>
        </form>

        <select
          value={departmentId}
          onChange={(e) => setParam("department_id", e.target.value)}
          aria-label="Filter by department"
          className={selectClass}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          value={availability}
          onChange={(e) => setParam("availability", e.target.value)}
          aria-label="Filter by availability"
          className={selectClass}
        >
          {AVAILABILITY.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        <select
          value={form}
          onChange={(e) => setParam("form", e.target.value)}
          aria-label="Filter by dosage form"
          className={selectClass}
        >
          <option value="">Any form</option>
          {FORM_OPTIONS.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value, "active")}
          aria-label="Filter by status"
          className={selectClass}
        >
          <option value="active">Available</option>
          <option value="discontinued">Discontinued</option>
          <option value="all">All</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => setSearchParams({}, { replace: true })}
            className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
          >
            Clear
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}
      {noticeMsg && (
        <p
          role="status"
          className="mt-5 flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <span>{noticeMsg}</span>
          <button
            onClick={() => setNoticeMsg("")}
            aria-label="Dismiss"
            className="shrink-0 text-emerald-600 hover:text-emerald-800"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        </p>
      )}

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <HiOutlineArchiveBox className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            {hasFilters ? "No medicine matches these filters." : "No medicines yet."}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {hasFilters
              ? "Try clearing a filter."
              : "Add the first one to start this department's inventory."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Medicine</th>
                <th className="px-5 py-3 font-medium">Departments</th>
                <th className="px-5 py-3 font-medium">Form</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">Expiry</th>
                <th className="px-5 py-3 font-medium">Stock</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-800">{r.display_name}</p>
                    <p className="text-xs text-slate-400">
                      {r.generic_name || "—"}
                      {r.manufacturer ? ` · ${r.manufacturer}` : ""}
                      {r.category ? ` · ${r.category}` : ""}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    {r.for_all_departments ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        All departments
                      </span>
                    ) : r.departments.length === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span className="text-xs text-slate-600">
                        {r.departments.map((d) => d.name).join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{r.form_label}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {r.unit_price == null ? "—" : `₹${r.unit_price.toFixed(2)}`}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {r.nearest_expiry
                      ? new Date(r.nearest_expiry).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        AVAILABILITY_STYLE[r.availability] || "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.total_quantity} · {AVAILABILITY_LABEL[r.availability]}
                    </span>
                    {r.quantity !== r.total_quantity && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {r.quantity} at this branch
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setFormError("");
                          setEditing(r);
                        }}
                        aria-label={`Edit ${r.display_name}`}
                        title="Edit"
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <HiOutlinePencilSquare className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(r)}
                        aria-label={`Delete ${r.display_name}`}
                        title="Delete"
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Page {meta.page} of {meta.pages} · {meta.total} medicines
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setParam("page", String(page - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setParam("page", String(page + 1))}
              disabled={page >= meta.pages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {adding && (
        <Modal title="Add medicine" onClose={() => setAdding(false)} wide>
          <MedicineForm
            defaultDepartmentId={departmentId}
            saving={saving}
            errorMsg={formError}
            onSubmit={handleCreate}
            onCancel={() => setAdding(false)}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.display_name}`} onClose={() => setEditing(null)} wide>
          <MedicineForm
            medicine={editing}
            saving={saving}
            errorMsg={formError}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.display_name}?`}
          message={
            `This removes ${deleting.display_name} from the catalogue and from every ` +
            "department that stocks it.\n\nIf it has already been prescribed, or still " +
            "holds stock, it will be marked discontinued instead of deleted — patient " +
            "records must not lose the medicine they refer to."
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          busy={saving}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
