import { useState } from "react";
import { HiOutlineExclamationTriangle, HiOutlinePlus } from "react-icons/hi2";
import Modal from "../Modal";
import { formatWhen } from "./NursingBadges";
import {
  isoToLocalInput,
  localInputToIso,
  recordObservation,
} from "../../services/nursingService";

// label, field, unit, input step. Ranges are checked server-side — the form
// stays permissive so a genuinely alarming reading can still be entered.
const VITALS = [
  { field: "temperature_c", label: "Temperature", unit: "°C", step: "0.1" },
  { field: "pulse_bpm", label: "Pulse", unit: "bpm", step: "1" },
  { field: "systolic_bp", label: "Systolic BP", unit: "mmHg", step: "1" },
  { field: "diastolic_bp", label: "Diastolic BP", unit: "mmHg", step: "1" },
  { field: "respiratory_rate", label: "Resp. rate", unit: "/min", step: "1" },
  { field: "spo2", label: "SpO₂", unit: "%", step: "1" },
  { field: "blood_sugar", label: "Blood sugar", unit: "mg/dL", step: "0.1" },
  { field: "pain_score", label: "Pain score", unit: "/10", step: "1" },
];

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

const EMPTY_FORM = {
  recorded_at: "",
  symptoms: "",
  recovery_progress: "",
  complications: "",
};

function RecordObservationModal({ assignmentId, onClose, onRecorded }) {
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    recorded_at: isoToLocalInput(),
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const result = await recordObservation(assignmentId, {
        ...form,
        recorded_at: localInputToIso(form.recorded_at),
      });
      onRecorded(result);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save this observation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Record observation" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelClass}>Recorded at</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={form.recorded_at}
            onChange={update("recorded_at")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VITALS.map(({ field, label, unit, step }) => (
            <div key={field}>
              <label className={labelClass}>
                {label} <span className="font-normal text-slate-400">{unit}</span>
              </label>
              <input
                type="number"
                step={step}
                className={inputClass}
                value={form[field] ?? ""}
                onChange={update(field)}
              />
            </div>
          ))}
        </div>

        <div>
          <label className={labelClass}>Symptoms</label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.symptoms}
            onChange={update("symptoms")}
            placeholder="What the patient is reporting"
          />
        </div>
        <div>
          <label className={labelClass}>Recovery progress</label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.recovery_progress}
            onChange={update("recovery_progress")}
            placeholder="Wound healing, mobility, appetite, sleep…"
          />
        </div>
        <div>
          <label className={labelClass}>Complications</label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.complications}
            onChange={update("complications")}
            placeholder="Leave blank if there are none"
          />
        </div>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Vitals outside the normal range — or any complication written here —
          alert the treating doctor automatically.
        </p>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save observation"}
        </button>
      </form>
    </Modal>
  );
}

function VitalChip({ label, value, unit, flagged }) {
  if (value === null || value === undefined) return null;
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-1 text-xs ${
        flagged ? "bg-red-50 font-semibold text-red-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold">
        {value}
        {unit}
      </span>
    </span>
  );
}

export default function ObservationsPanel({ assignment, canRecord, onChanged }) {
  const [recording, setRecording] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Observations</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {assignment.observations.length} recorded during this period
          </p>
        </div>
        {canRecord && (
          <button
            onClick={() => setRecording(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Record observation
          </button>
        )}
      </div>

      {assignment.observations.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          No observations yet.
          {canRecord ? " Record vitals at the start of each round." : ""}
        </p>
      ) : (
        <div className="space-y-3">
          {assignment.observations.map((o) => {
            const flagged = new Set(o.abnormal_vitals);
            return (
              <div
                key={o.id}
                className={`rounded-xl border p-4 ${
                  o.is_abnormal ? "border-red-200 bg-red-50/40" : "border-slate-100"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {formatWhen(o.recorded_at)}
                  </p>
                  <div className="flex items-center gap-2">
                    {o.is_abnormal && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                        <HiOutlineExclamationTriangle className="h-3.5 w-3.5" />
                        {o.abnormal_vitals.length > 0
                          ? o.abnormal_vitals.join(", ")
                          : "Complication"}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{o.nurse}</span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <VitalChip label="Temp" value={o.temperature_c} unit="°C" flagged={flagged.has("Temperature")} />
                  <VitalChip label="Pulse" value={o.pulse_bpm} unit=" bpm" flagged={flagged.has("Pulse")} />
                  {o.systolic_bp != null && o.diastolic_bp != null && (
                    <VitalChip
                      label="BP"
                      value={`${o.systolic_bp}/${o.diastolic_bp}`}
                      unit=" mmHg"
                      flagged={flagged.has("Systolic BP") || flagged.has("Diastolic BP")}
                    />
                  )}
                  <VitalChip label="RR" value={o.respiratory_rate} unit="/min" flagged={flagged.has("Respiratory rate")} />
                  <VitalChip label="SpO₂" value={o.spo2} unit="%" flagged={flagged.has("SpO₂")} />
                  <VitalChip label="BG" value={o.blood_sugar} unit=" mg/dL" flagged={flagged.has("Blood sugar")} />
                  <VitalChip label="Pain" value={o.pain_score} unit="/10" flagged={flagged.has("Pain score")} />
                </div>

                {(o.symptoms || o.recovery_progress || o.complications) && (
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    {o.symptoms && (
                      <p>
                        <span className="font-semibold text-slate-700">Symptoms: </span>
                        {o.symptoms}
                      </p>
                    )}
                    {o.recovery_progress && (
                      <p>
                        <span className="font-semibold text-slate-700">Progress: </span>
                        {o.recovery_progress}
                      </p>
                    )}
                    {o.complications && (
                      <p className="text-red-700">
                        <span className="font-semibold">Complications: </span>
                        {o.complications}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {recording && (
        <RecordObservationModal
          assignmentId={assignment.id}
          onClose={() => setRecording(false)}
          onRecorded={() => {
            setRecording(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
