import { useEffect, useState } from "react";
import Modal from "../Modal";
import PatientPicker from "../PatientPicker";
import { createLabRequest, fetchLabOptions } from "../../services/labService";

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/**
 * A doctor ordering a test for one of their patients.
 *
 * The catalogue is a suggestion list, not a constraint — picking one fills in
 * the category and specimen, and typing a name the list has never heard of is
 * still a valid order. A hospital runs tests this app does not know about,
 * and refusing the order would be the wrong failure.
 */
export default function OrderLabTestModal({ patientId, consultationId, onClose, onCreated }) {
  const [options, setOptions] = useState({ catalogue: [], technicians: [] });
  const [form, setForm] = useState({
    patient_id: patientId ? String(patientId) : "",
    test_name: "",
    test_category: "",
    specimen: "",
    priority: "routine",
    technician_id: "",
    clinical_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchLabOptions()
      .then(setOptions)
      .catch(() => setErrorMsg("Could not load the test catalogue."));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const catalogue = options.catalogue || [];
  const matched = catalogue.find((c) => c.name === form.test_name);

  // Choosing from the list fills the two fields the lab needs to route the
  // sample. Typing freely leaves them for the doctor to set.
  function handleCatalogue(e) {
    const name = e.target.value;
    const entry = catalogue.find((c) => c.name === name);
    setForm((f) => ({
      ...f,
      test_name: name,
      test_category: entry?.category ?? f.test_category,
      specimen: entry?.specimen ?? f.specimen,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const created = await createLabRequest({
        patient_id: Number(form.patient_id),
        consultation_id: consultationId || undefined,
        test_name: form.test_name.trim(),
        test_category: form.test_category.trim() || undefined,
        specimen: form.specimen.trim() || undefined,
        priority: form.priority,
        technician_id: form.technician_id ? Number(form.technician_id) : null,
        clinical_notes: form.clinical_notes.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not order that test.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Order a lab test" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {!patientId && (
          // Searched rather than picked off a list of everybody: the doctor
          // knows the name, and the endpoint behind it only ever offers
          // patients this caller may order for — the same scoping the order
          // itself gets, so the picker cannot suggest one the request would
          // then be refused for.
          <PatientPicker
            required
            value={form.patient_id}
            onChange={(patient) =>
              setForm((f) => ({ ...f, patient_id: patient ? String(patient.id) : "" }))
            }
          />
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Test *</label>
          <input
            required
            list="lab-catalogue"
            className={inputClass}
            value={form.test_name}
            onChange={handleCatalogue}
            placeholder="Start typing, or pick from the list"
          />
          <datalist id="lab-catalogue">
            {catalogue.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
          {form.test_name && !matched && (
            <p className="mt-1 text-xs text-slate-400">
              Not in the standard list — the lab will see exactly what you typed.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Category</label>
            <input
              className={inputClass}
              value={form.test_category}
              onChange={update("test_category")}
              placeholder="e.g. Haematology"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Specimen</label>
            <input
              className={inputClass}
              value={form.specimen}
              onChange={update("specimen")}
              placeholder="e.g. Blood"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Priority</label>
            <select className={inputClass} value={form.priority} onChange={update("priority")}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Lab technician
            </label>
            <select
              className={inputClass}
              value={form.technician_id}
              onChange={update("technician_id")}
            >
              {/* Leaving it open puts the test in the unclaimed pool, which
                  every technician can see and pick up. */}
              <option value="">Any available technician</option>
              {(options.technicians || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.lab_department ? ` — ${t.lab_department}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Clinical notes for the lab
          </label>
          <textarea
            rows={3}
            className={inputClass}
            value={form.clinical_notes}
            onChange={update("clinical_notes")}
            placeholder="Why you're ordering it, and anything the lab needs to know — fasting, current medication, suspected diagnosis."
          />
        </div>

        {errorMsg && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={saving || !form.patient_id || !form.test_name.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Ordering…" : "Order test"}
        </button>
      </form>
    </Modal>
  );
}
