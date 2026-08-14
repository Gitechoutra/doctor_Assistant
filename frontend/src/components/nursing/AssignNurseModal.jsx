import { useEffect, useState } from "react";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";
import Modal from "../Modal";
import { createAssignment, fetchNurses } from "../../services/nursingService";

const CARE_TYPES = [
  { value: "observation", label: "Observation" },
  { value: "post_surgery", label: "Post-surgery" },
  { value: "post_procedure", label: "Post-procedure" },
  { value: "recovery", label: "Recovery" },
  { value: "icu", label: "ICU" },
];

// Mirrors the server's enum (nursing_routes.ROUTES) and MedicationPanel's list.
const ROUTES = [
  { value: "oral", label: "Tablet / Oral" },
  { value: "injection", label: "Injection" },
  { value: "iv", label: "IV / Saline" },
  { value: "topical", label: "Topical" },
  { value: "inhalation", label: "Inhalation" },
  { value: "other", label: "Other" },
];

const EMPTY_MEDICATION = {
  medicine_name: "",
  route: "oral",
  dose: "",
  frequency: "",
  duration: "",
  times_per_day: "",
  instructions: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

// Matches the backend's default in models/patient.
const DEFAULT_OBSERVATION_DAYS = 3;

/**
 * The hand-off: a doctor names the nurse who will watch this patient.
 *
 * Reached from a surgery case (the API refuses the assignment for a patient
 * nobody has marked as needing surgery — this modal defaults the care type
 * for that path) or from an open Emergency Case with no surgery involved at
 * all (`defaultCareType` overrides that default for ICU/observation care).
 *
 * `consultationId` is optional but worth passing — with it the prescription is
 * carried straight into the nurse's medication schedule instead of being
 * re-typed, and the nurse can read the consultation summary alongside it.
 */
export default function AssignNurseModal({
  patientId,
  patientName,
  consultationId = null,
  defaultPlan = "",
  defaultCareType = "post_surgery",
  observationDays = DEFAULT_OBSERVATION_DAYS,
  isEmergency = false,
  onClose,
  onAssigned,
}) {
  const [nurses, setNurses] = useState([]);
  const [form, setForm] = useState({
    nurse_id: "",
    care_type: defaultCareType,
    observation_days: observationDays || DEFAULT_OBSERVATION_DAYS,
    treatment_plan: defaultPlan,
    care_instructions: "",
    import_prescription: true,
  });
  // Kept separate from `form` rather than folded into its `update(field)`
  // helper, which only ever replaces a single top-level value — a row here
  // needs one field changed without touching the others.
  const [medications, setMedications] = useState([{ ...EMPTY_MEDICATION }]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingNurses, setLoadingNurses] = useState(true);

  useEffect(() => {
    fetchNurses()
      .then(setNurses)
      .catch(() => setErrorMsg("Could not load the nurse list."))
      .finally(() => setLoadingNurses(false));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function updateMedication(index, field) {
    return (e) => {
      const value = e.target.value;
      setMedications((rows) =>
        rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
      );
    };
  }

  function addMedicationRow() {
    setMedications((rows) => [...rows, { ...EMPTY_MEDICATION }]);
  }

  function removeMedicationRow(index) {
    setMedications((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      // A row left blank (the default single row, if never touched) isn't a
      // medicine to send — the server rejects any entry with no name.
      const filledMedications = medications.filter((row) => row.medicine_name.trim());
      const assignment = await createAssignment({
        patient_id: patientId,
        consultation_id: consultationId,
        ...form,
        medications: filledMedications,
      });
      onAssigned(assignment);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not assign a nurse.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Assign a nurse to ${patientName}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelClass}>Nurse *</label>
          <select
            required
            className={inputClass}
            value={form.nurse_id}
            onChange={update("nurse_id")}
            disabled={loadingNurses}
          >
            <option value="">
              {loadingNurses ? "Loading nurses…" : "Choose who will monitor this patient"}
            </option>
            {/* Name only. The list previously carried the nurse's department
                and shift, which read as a second job title and made it look
                like doctors were mixed in — the endpoint only ever returns
                nurses. Picking a nurse needs a name, nothing else. */}
            {nurses.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          {!loadingNurses && nurses.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-600">
              No nurse accounts exist yet — an admin needs to create one first.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Type of care</label>
            <select className={inputClass} value={form.care_type} onChange={update("care_type")}>
              {CARE_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Observe for (days)</label>
            <input
              type="number"
              min="1"
              max="90"
              className={inputClass}
              value={form.observation_days}
              onChange={update("observation_days")}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              A plan, not a cut-off — the patient stays on the nurse&apos;s list
              until someone discharges them. Re-dated from the operation when
              you mark the surgery completed.
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Treatment plan</label>
          <textarea
            rows={3}
            className={inputClass}
            value={form.treatment_plan}
            onChange={update("treatment_plan")}
            placeholder="What was done, and what recovery should look like"
          />
        </div>

        <div>
          <label className={labelClass}>Care instructions for the nurse</label>
          <textarea
            rows={3}
            className={inputClass}
            value={form.care_instructions}
            onChange={update("care_instructions")}
            placeholder="e.g. Vitals every 4 hours. Watch the wound site. Call me if the fever goes above 38.5°C."
          />
        </div>

        <div>
          <label className={labelClass}>Medicines for the nurse to follow</label>
          <p className="mb-2 text-[11px] text-slate-400">
            Goes straight onto the nurse&apos;s medication schedule, in the same table they and
            you both see on the assignment record — so the two of you are reading the same
            dosage instructions rather than a plan retyped from notes.
          </p>
          {/* An emergency patient has no consultation, so nothing else the
              doctor writes reaches the ward as a prescription — what is typed
              here is the whole of it. Worth saying plainly at the point of
              entry, because a row left half-filled here reaches the nurse as
              a medicine with no frequency. */}
          {isEmergency && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
              This is the emergency prescription — an emergency patient has no consultation
              to carry one over from, so these rows are the only medication instructions the
              nurse receives. Fill in the dose, frequency and duration on each.
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-2xl text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="w-1/4 px-2.5 py-2 font-medium">Medicine</th>
                  <th className="px-2.5 py-2 font-medium">Route</th>
                  <th className="px-2.5 py-2 font-medium">Dose</th>
                  <th className="px-2.5 py-2 font-medium">Frequency</th>
                  <th className="px-2.5 py-2 font-medium">Duration</th>
                  <th className="px-2.5 py-2 font-medium">Doses/day</th>
                  <th className="w-1/5 px-2.5 py-2 font-medium">Instructions</th>
                  <th className="px-2.5 py-2" />
                </tr>
              </thead>
              <tbody>
                {medications.map((row, index) => (
                  <tr key={index} className="border-b border-slate-50 last:border-0">
                    <td className="p-1.5">
                      <input
                        className={inputClass}
                        value={row.medicine_name}
                        onChange={updateMedication(index, "medicine_name")}
                        placeholder="e.g. Paracetamol 650mg"
                      />
                    </td>
                    <td className="p-1.5">
                      <select
                        className={inputClass}
                        value={row.route}
                        onChange={updateMedication(index, "route")}
                      >
                        {ROUTES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1.5">
                      <input
                        className={inputClass}
                        value={row.dose}
                        onChange={updateMedication(index, "dose")}
                        placeholder="1 tablet"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        className={inputClass}
                        value={row.frequency}
                        onChange={updateMedication(index, "frequency")}
                        placeholder="Twice daily"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        className={inputClass}
                        value={row.duration}
                        onChange={updateMedication(index, "duration")}
                        placeholder="5 days"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        min="1"
                        max="24"
                        className={inputClass}
                        value={row.times_per_day}
                        onChange={updateMedication(index, "times_per_day")}
                        placeholder="PRN"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        className={inputClass}
                        value={row.instructions}
                        onChange={updateMedication(index, "instructions")}
                        placeholder="e.g. After food"
                      />
                    </td>
                    <td className="p-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeMedicationRow(index)}
                        disabled={medications.length === 1}
                        aria-label="Remove this medicine"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addMedicationRow}
            className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Add another medicine
          </button>
        </div>

        {consultationId && (
          <label className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.import_prescription}
              onChange={(e) =>
                setForm((f) => ({ ...f, import_prescription: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              Copy this consultation&apos;s prescription into the nurse&apos;s medication
              schedule
              <span className="block text-[11px] text-slate-400">
                The nurse logs each dose against it — that&apos;s what medication
                compliance is measured from.
              </span>
            </span>
          </label>
        )}

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving || loadingNurses}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Assigning…" : "Assign nurse"}
        </button>
      </form>
    </Modal>
  );
}
