import { useState } from "react";
import { HiOutlineBellAlert, HiOutlineCheckCircle } from "react-icons/hi2";
import Modal from "../Modal";
import { AlertStatusBadge, SeverityBadge, formatWhen } from "./NursingBadges";
import { acknowledgeAlert, raiseAlert } from "../../services/nursingService";

const CATEGORIES = [
  { value: "emergency", label: "Emergency" },
  { value: "critical_change", label: "Critical change in condition" },
  { value: "abnormal_observation", label: "Abnormal observation" },
  { value: "missed_medication", label: "Missed medication" },
  { value: "other", label: "Other" },
];

const SEVERITIES = [
  { value: "info", label: "For information" },
  { value: "warning", label: "Needs attention" },
  { value: "critical", label: "Urgent" },
];

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

function RaiseAlertModal({ assignmentId, doctorName, onClose, onRaised }) {
  const [form, setForm] = useState({
    category: "critical_change",
    severity: "warning",
    message: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      await raiseAlert(assignmentId, form);
      onRaised();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not send this alert.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Flag ${doctorName || "the doctor"}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>What is it?</label>
            <select className={inputClass} value={form.category} onChange={update("category")}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>How urgent?</label>
            <select className={inputClass} value={form.severity} onChange={update("severity")}>
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>What does the doctor need to know? *</label>
          <textarea
            required
            rows={4}
            className={inputClass}
            value={form.message}
            onChange={update("message")}
            placeholder="Be specific — this is what lands in the doctor's notifications."
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-red-500 to-red-600 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Sending…" : "Notify the doctor"}
        </button>
      </form>
    </Modal>
  );
}

function AcknowledgeModal({ alert, onClose, onDone }) {
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(status) {
    setSaving(true);
    setErrorMsg("");
    try {
      await acknowledgeAlert(alert.id, { status, doctor_response: response });
      onDone();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not update this alert.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Respond to alert" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {alert.category_label} · raised by {alert.nurse}
          </p>
          {alert.message}
        </div>

        <div>
          <label className={labelClass}>Instruction back to the nurse (optional)</label>
          <textarea
            rows={3}
            className={inputClass}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="e.g. Hold the next dose and recheck BP in an hour."
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => submit("acknowledged")}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Acknowledge
          </button>
          <button
            onClick={() => submit("resolved")}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
          >
            Mark resolved
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The escalation channel, from both sides: the nurse raises, the doctor
 * answers. Which half is interactive comes from `canRecord` (nurse) and
 * `canAcknowledge` (doctor) — the server enforces the same split.
 */
export default function AlertsPanel({
  assignment,
  canRecord,
  canAcknowledge,
  onChanged,
}) {
  const [raising, setRaising] = useState(false);
  const [responding, setResponding] = useState(null);

  const open = assignment.alerts.filter((a) => a.status === "open");

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Doctor alerts</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {open.length > 0
              ? `${open.length} awaiting the doctor`
              : "Nothing outstanding"}
          </p>
        </div>
        {canRecord && (
          <button
            onClick={() => setRaising(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-3 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlineBellAlert className="h-4 w-4" />
            Flag the doctor
          </button>
        )}
      </div>

      {assignment.alerts.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          No alerts have been raised for this patient.
        </p>
      ) : (
        <div className="space-y-3">
          {assignment.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 ${
                alert.status === "open"
                  ? alert.severity === "critical"
                    ? "border-red-300 bg-red-50/60"
                    : "border-amber-200 bg-amber-50/40"
                  : "border-slate-100"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={alert.severity}>
                    {alert.category_label}
                  </SeverityBadge>
                  <AlertStatusBadge status={alert.status} />
                </div>
                <p className="text-xs text-slate-400">
                  {alert.nurse} · {formatWhen(alert.created_at)}
                </p>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-slate-700">{alert.message}</p>

              {alert.doctor_response && (
                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                  <span className="font-semibold text-emerald-700">
                    Doctor&apos;s reply:{" "}
                  </span>
                  {alert.doctor_response}
                </p>
              )}

              {alert.acknowledged_at && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                  <HiOutlineCheckCircle className="h-4 w-4" />
                  {alert.status} by {alert.acknowledged_by} ·{" "}
                  {formatWhen(alert.acknowledged_at)}
                </p>
              )}

              {canAcknowledge && alert.status === "open" && (
                <button
                  onClick={() => setResponding(alert)}
                  className="mt-3 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
                >
                  Respond
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {raising && (
        <RaiseAlertModal
          assignmentId={assignment.id}
          doctorName={assignment.doctor}
          onClose={() => setRaising(false)}
          onRaised={() => {
            setRaising(false);
            onChanged();
          }}
        />
      )}

      {responding && (
        <AcknowledgeModal
          alert={responding}
          onClose={() => setResponding(null)}
          onDone={() => {
            setResponding(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
