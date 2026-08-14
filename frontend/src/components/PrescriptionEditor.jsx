import { useState } from "react";
import {
  HiOutlineExclamationTriangle,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi2";
import MedicineSearch from "./MedicineSearch";
import { ROUTE_OPTIONS } from "../constants/medicines";


const cellClass =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400";

function toRow(prescription) {
  return {
    medicine_name: prescription.medicine_name || "",
    brand_id: prescription.brand_id ?? null,
    dose: prescription.dose || "",
    frequency: prescription.frequency || "",
    duration: prescription.duration || "",
    quantity: prescription.quantity || "",
    route: prescription.route || "",
    instructions: prescription.instructions || "",
    notes: prescription.notes || "",
    is_custom: Boolean(prescription.is_custom),
    // Carried through so a line the AI proposed that the pharmacy doesn't
    // stock can be shown as needing replacement rather than silently failing
    // on save.
    matched_formulary: prescription.matched_formulary !== false,
  };
}

const inputClass =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/**
 * Manual entry, for a medicine the pharmacy does not carry.
 *
 * Deliberately behind a button rather than letting the name field be typed
 * freely: choosing to go off-catalogue is a decision worth making on purpose,
 * and it puts the medicine in front of the pharmacy afterwards. A typo in a
 * search box should not quietly become one.
 */
function CustomMedicineForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({
    medicine_name: "",
    dose: "",
    frequency: "",
    duration: "",
    quantity: "",
    route: "",
    instructions: "",
    notes: "",
  });
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.medicine_name.trim()) {
      setErrorMsg("Enter the medicine name.");
      return;
    }
    onAdd({ ...form, medicine_name: form.medicine_name.trim(), is_custom: true });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4"
    >
      <p className="text-sm font-semibold text-slate-800">Add a medicine by hand</p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        For something the pharmacy does not stock. It goes on this prescription as written,
        and the pharmacy is asked afterwards whether to add it to the medicine database.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Medicine name *</label>
          <input
            autoFocus
            className={inputClass}
            value={form.medicine_name}
            onChange={update("medicine_name")}
            placeholder="e.g. Vitamin D3 60000 IU"
          />
        </div>
        <div>
          <label className={labelClass}>Route of administration</label>
          <select className={inputClass} value={form.route} onChange={update("route")}>
            {ROUTE_OPTIONS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Dosage / strength</label>
          <input
            className={inputClass}
            value={form.dose}
            onChange={update("dose")}
            placeholder="1 sachet"
          />
        </div>
        <div>
          <label className={labelClass}>Frequency</label>
          <input
            className={inputClass}
            value={form.frequency}
            onChange={update("frequency")}
            placeholder="Once weekly"
          />
        </div>
        <div>
          <label className={labelClass}>Duration</label>
          <input
            className={inputClass}
            value={form.duration}
            onChange={update("duration")}
            placeholder="8 weeks"
          />
        </div>
        <div>
          <label className={labelClass}>Quantity</label>
          <input
            className={inputClass}
            value={form.quantity}
            onChange={update("quantity")}
            placeholder="8 sachets"
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Special instructions</label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.instructions}
            onChange={update("instructions")}
            placeholder="Dissolve in water, take after breakfast"
          />
        </div>
        <div>
          <label className={labelClass}>Notes (not printed for the patient)</label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.notes}
            onChange={update("notes")}
            placeholder="e.g. not stocked — patient to buy outside"
          />
        </div>
      </div>

      {errorMsg && <p className="mt-2 text-sm text-red-600">{errorMsg}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700"
        >
          Add to prescription
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Edits the prescription: search the pharmacy, add with +, then adjust.
 *
 * Medicines are picked rather than typed. The name field is deliberately
 * read-only — a prescription that names something the pharmacy doesn't carry
 * cannot be dispensed, and the server rejects one, so letting a doctor type
 * freely would only produce an error at save time.
 *
 * Saving sends the whole list, so what is stored is exactly what is on screen.
 */
export default function PrescriptionEditor({ prescriptions, saving, onCancel, onSave }) {
  const [rows, setRows] = useState(() => prescriptions.map(toRow));
  const [addingCustom, setAddingCustom] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function updateRow(index, field, value) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function removeRow(index) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function addMedicine(medicine) {
    setRows((current) => {
      if (current.some((r) => r.brand_id === medicine.brand_id)) return current;
      return [
        ...current,
        {
          medicine_name: medicine.name,
          brand_id: medicine.brand_id,
          dose: "",
          frequency: "",
          duration: "",
          quantity: "",
          route: "",
          // Pre-filled from the pharmacy's own instructions for this medicine,
          // so the common case needs no typing at all.
          instructions: medicine.usage_instructions || "",
          notes: "",
          is_custom: false,
          matched_formulary: true,
        },
      ];
    });
    setErrorMsg("");
  }

  function addCustom(entry) {
    setRows((current) => [...current, { ...entry, brand_id: null, matched_formulary: true }]);
    setAddingCustom(false);
    setErrorMsg("");
  }

  function handleSave() {
    // A line that resolved to nothing and was not deliberately entered by
    // hand is the one case the server refuses, so it is caught here first
    // with an explanation rather than as a save failure.
    const unstocked = rows.filter((r) => !r.matched_formulary && !r.is_custom);
    if (unstocked.length) {
      setErrorMsg(
        `${unstocked
          .map((r) => r.medicine_name)
          .join(", ")} is not in your department's pharmacy list. Remove it, pick a ` +
          "stocked medicine, or re-enter it with Add custom medicine."
      );
      return;
    }
    if (rows.some((r) => !r.medicine_name.trim())) {
      setErrorMsg("Every medicine needs a name.");
      return;
    }
    setErrorMsg("");
    onSave(rows);
  }

  const addedBrandIds = rows.map((r) => r.brand_id).filter(Boolean);

  return (
    <div>
      <div>
        <p className={labelClass}>Search medicine</p>
        <MedicineSearch alreadyAdded={addedBrandIds} onAdd={addMedicine} />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400">
            Medicines come from the pharmacy's inventory for your department, in stock now.
            Press <span className="font-semibold">+</span> to add one, then set the dosage
            below.
          </p>
          {/* The escape hatch. The catalogue must never be the reason a
              patient does not get what they need. */}
          <button
            type="button"
            onClick={() => setAddingCustom((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            <HiOutlinePlus className="h-3.5 w-3.5" />
            Add custom medicine
          </button>
        </div>

        {addingCustom && (
          <CustomMedicineForm onAdd={addCustom} onCancel={() => setAddingCustom(false)} />
        )}
      </div>

      <div className="mt-4 space-y-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">No medicines on this prescription.</p>
            <p className="mt-1 text-xs text-slate-400">
              Search above to add one, add a custom medicine, or save an empty prescription
              if none is needed.
            </p>
          </div>
        )}

        {rows.map((row, i) => (
          <div
            key={`${row.brand_id ?? "free"}-${i}`}
            className={`rounded-xl border p-4 ${
              row.matched_formulary
                ? "border-slate-200 bg-white"
                : "border-amber-200 bg-amber-50/50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {row.is_custom ? (
                  // A hand-entered name stays editable — a typo caught before
                  // saving should not mean deleting the row and starting over.
                  <>
                    <label className={labelClass}>
                      <span className="inline-flex items-center gap-1">
                        <HiOutlinePencilSquare className="h-3 w-3" />
                        Medicine name (entered by hand)
                      </span>
                    </label>
                    <input
                      className={`${inputClass} font-semibold`}
                      value={row.medicine_name}
                      onChange={(e) => updateRow(i, "medicine_name", e.target.value)}
                    />
                  </>
                ) : (
                  <p className="font-semibold text-slate-800">{row.medicine_name}</p>
                )}
                {row.is_custom && (
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    Not in the pharmacy database. It will be prescribed as written, and the
                    pharmacy will be asked whether to add it permanently.
                  </p>
                )}
                {!row.matched_formulary && !row.is_custom && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                    <HiOutlineExclamationTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Not stocked by your department — remove it and pick a stocked medicine.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label={`Remove ${row.medicine_name}`}
                title="Remove"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <HiOutlineTrash className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={labelClass}>Dose</label>
                <input
                  className={cellClass}
                  value={row.dose}
                  onChange={(e) => updateRow(i, "dose", e.target.value)}
                  placeholder="1 tablet"
                />
              </div>
              <div>
                <label className={labelClass}>Frequency</label>
                <input
                  className={cellClass}
                  value={row.frequency}
                  onChange={(e) => updateRow(i, "frequency", e.target.value)}
                  placeholder="Twice daily"
                />
              </div>
              <div>
                <label className={labelClass}>Duration</label>
                <input
                  className={cellClass}
                  value={row.duration}
                  onChange={(e) => updateRow(i, "duration", e.target.value)}
                  placeholder="5 days"
                />
              </div>
              <div>
                <label className={labelClass}>Quantity</label>
                <input
                  className={cellClass}
                  value={row.quantity}
                  onChange={(e) => updateRow(i, "quantity", e.target.value)}
                  placeholder="10 tablets"
                />
              </div>
            </div>

            {/* Route is only offered on hand-entered medicines — a catalogue
                item already carries its dosage form, and asking again would
                invite the two to disagree. */}
            {row.is_custom && (
              <div className="mt-3 sm:w-1/4">
                <label className={labelClass}>Route</label>
                <select
                  className={cellClass}
                  value={row.route}
                  onChange={(e) => updateRow(i, "route", e.target.value)}
                >
                  {ROUTE_OPTIONS.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Instructions for the patient</label>
                <textarea
                  rows={2}
                  className={cellClass}
                  value={row.instructions}
                  onChange={(e) => updateRow(i, "instructions", e.target.value)}
                  placeholder="Take after food with water"
                />
              </div>
              <div>
                <label className={labelClass}>Notes (not printed for the patient)</label>
                <textarea
                  rows={2}
                  className={cellClass}
                  value={row.notes}
                  onChange={(e) => updateRow(i, "notes", e.target.value)}
                  placeholder="e.g. review response before repeating"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save prescription"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
        <p className="ml-1 text-xs text-slate-400">
          {rows.length} medicine{rows.length === 1 ? "" : "s"} · verify after saving to enable
          printing.
        </p>
      </div>
    </div>
  );
}
