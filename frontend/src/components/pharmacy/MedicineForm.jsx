import { useEffect, useState } from "react";
import { HiOutlineCheck, HiOutlinePlus } from "react-icons/hi2";
import { fetchDepartments } from "../../services/departmentService";
import { FORM_OPTIONS } from "../../constants/medicines";


const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const label = "mb-1 block text-xs font-semibold text-slate-600";

const EMPTY = {
  brand_name: "",
  strength: "",
  generic_name: "",
  used_for: "",
  usage_instructions: "",
  category: "",
  manufacturer: "",
  form: "tablet",
  unit_price: "",
  reorder_level: 20,
  for_all_departments: false,
  department_ids: [],
  is_active: true,
};

function toFormState(medicine) {
  if (!medicine) return { ...EMPTY };
  return {
    brand_name: medicine.brand_name || "",
    strength: medicine.strength || "",
    generic_name: medicine.generic_name || "",
    used_for: medicine.used_for || "",
    usage_instructions: medicine.usage_instructions || "",
    category: medicine.category || "",
    manufacturer: medicine.manufacturer || "",
    form: medicine.form || "tablet",
    unit_price: medicine.unit_price ?? "",
    reorder_level: medicine.reorder_level ?? 20,
    for_all_departments: Boolean(medicine.for_all_departments),
    department_ids: medicine.department_ids || [],
    is_active: medicine.is_active !== false,
  };
}

/**
 * The one medicine form, used both to add a new one and to edit an existing
 * one. Shared rather than duplicated so the two can never drift apart on
 * validation or on which fields exist.
 *
 * `medicine` present means edit; absent means add.
 */
export default function MedicineForm({
  medicine,
  defaultDepartmentId,
  saving,
  errorMsg,
  submitLabel,
  onSubmit,
  onCancel,
}) {
  const [form, setForm] = useState(() => {
    const initial = toFormState(medicine);
    // Adding from inside a department's page pre-selects it — that is almost
    // always the department being stocked.
    if (!medicine && defaultDepartmentId && !initial.department_ids.length) {
      initial.department_ids = [Number(defaultDepartmentId)];
    }
    return initial;
  });
  const [departments, setDepartments] = useState([]);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    fetchDepartments()
      .then(setDepartments)
      .catch(() => setLocalError("Could not load departments."));
  }, []);

  const update = (field) => (e) =>
    setForm((f) => ({
      ...f,
      [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  function toggleDepartment(id) {
    setForm((f) => ({
      ...f,
      department_ids: f.department_ids.includes(id)
        ? f.department_ids.filter((d) => d !== id)
        : [...f.department_ids, id],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    // Checked here as well as on the server: a medicine filed under no
    // department is in the catalogue but on nobody's shelf, and finding that
    // out after saving is a worse way to learn it.
    if (!form.for_all_departments && form.department_ids.length === 0) {
      setLocalError(
        "Choose at least one department, or tick “stocked by all departments”."
      );
      return;
    }
    setLocalError("");
    onSubmit({
      ...form,
      unit_price: form.unit_price === "" ? null : Number(form.unit_price),
      reorder_level: Number(form.reorder_level) || 0,
    });
  }

  const shown = localError || errorMsg;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Medicine / brand name *</label>
          <input
            required
            className={input}
            value={form.brand_name}
            onChange={update("brand_name")}
            placeholder="e.g. Dolo 650"
          />
        </div>
        <div>
          <label className={label}>Strength</label>
          <input
            className={input}
            value={form.strength}
            onChange={update("strength")}
            placeholder="e.g. 650mg, 100ml"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Part of what makes a medicine unique — 250mg and 500mg are different products.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Generic / salt name</label>
          <input
            className={input}
            value={form.generic_name}
            onChange={update("generic_name")}
            placeholder="e.g. Paracetamol"
          />
        </div>
        <div>
          <label className={label}>Manufacturer</label>
          <input
            className={input}
            value={form.manufacturer}
            onChange={update("manufacturer")}
            placeholder="e.g. Micro Labs"
          />
        </div>
      </div>

      {/* Departments: the field that decides which doctors can prescribe this
          and which department page it appears on. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-xs font-semibold text-slate-700">Departments *</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Which departments stock this medicine. Doctors are only offered medicines from
          their own department.
        </p>

        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={form.for_all_departments}
            onChange={update("for_all_departments")}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
          />
          <span>
            <span className="text-sm font-medium text-slate-800">
              Stocked by all departments
            </span>
            <span className="block text-[11px] text-slate-500">
              For general stock like analgesics and IV fluids. Stays correct when a new
              department is opened, so it need not be re-tagged.
            </span>
          </span>
        </label>

        {!form.for_all_departments && (
          <div className="mt-3 flex flex-wrap gap-2">
            {departments.map((d) => {
              const on = form.department_ids.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDepartment(d.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {on && <HiOutlineCheck className="h-3.5 w-3.5" />}
                  {d.name}
                </button>
              );
            })}
            {departments.length === 0 && (
              <p className="text-xs text-slate-400">No departments found.</p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className={label}>What is it used for?</label>
        <textarea
          rows={2}
          className={input}
          value={form.used_for}
          onChange={update("used_for")}
          placeholder="e.g. Fever, mild to moderate pain, headache, body ache"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          Searchable — typing &ldquo;fever&rdquo; at the counter finds this medicine without
          the brand name.
        </p>
      </div>

      <div>
        <label className={label}>Usage instructions</label>
        <textarea
          rows={2}
          className={input}
          value={form.usage_instructions}
          onChange={update("usage_instructions")}
          placeholder="e.g. Swallow whole after food with water. Do not crush or chew."
        />
        <p className="mt-1 text-[11px] text-slate-400">
          How to take it. Offered to the doctor alongside this medicine when prescribing.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className={label}>Category</label>
          <input
            className={input}
            value={form.category}
            onChange={update("category")}
            placeholder="e.g. Antibiotic"
          />
        </div>
        <div>
          <label className={label}>Dosage form</label>
          <select className={input} value={form.form} onChange={update("form")}>
            {FORM_OPTIONS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Unit price (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={input}
            value={form.unit_price}
            onChange={update("unit_price")}
            placeholder="e.g. 2.50"
          />
        </div>
        <div>
          <label className={label}>Reorder level</label>
          <input
            type="number"
            min="0"
            className={input}
            value={form.reorder_level}
            onChange={update("reorder_level")}
          />
          <p className="mt-1 text-[11px] text-slate-400">Below this it shows as low stock.</p>
        </div>
      </div>

      {medicine && (
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={update("is_active")}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
          />
          <span>
            <span className="text-sm font-medium text-slate-800">Available for use</span>
            <span className="block text-[11px] text-slate-500">
              Unticking discontinues it: it disappears from department lists and doctors can
              no longer prescribe it, while past prescriptions stay intact.
            </span>
          </span>
        </label>
      )}

      {shown && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{shown}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {!medicine && <HiOutlinePlus className="h-4 w-4" />}
          {saving ? "Saving…" : submitLabel || (medicine ? "Save changes" : "Add medicine")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
