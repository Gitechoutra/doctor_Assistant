import { useState } from "react";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineHeart,
  HiOutlineScissors,
} from "react-icons/hi2";
import ConfirmDialog from "../ConfirmDialog";
import {
  clearSurgery,
  completeSurgery,
  dischargePatient,
  markSurgeryRequired,
} from "../../services/patientService";

const DEFAULT_OBSERVATION_DAYS = 3;

/**
 * Where a patient stands on the surgical pathway, and the one action that
 * moves them along it.
 *
 * Nursing care is a post-operative watch, so this panel is also the gate on
 * the nurse hand-off: `Assign nurse` appears once, when the doctor has said
 * the case needs surgery, and never for anyone else. The API enforces the
 * same rule, so hiding the button is the courtesy, not the control.
 *
 * The four stages, and what each offers:
 *
 *   (none)               "Does this need surgery?" — mark it, or leave it
 *   required             assign a nurse; mark the surgery completed
 *   post_op              observation running; discharge when ready
 *   ready_for_discharge  the window has elapsed; discharge
 */
export default function SurgeryPanel({
  patient,
  canManage = true,
  hasActiveAssignment = false,
  onAssignNurse,
  onPatientUpdated,
}) {
  const [busy, setBusy] = useState(null); // "mark" | "clear" | "complete" | "discharge"
  const [days, setDays] = useState(patient?.observation_days || DEFAULT_OBSERVATION_DAYS);
  const [confirming, setConfirming] = useState(null); // "complete" | "discharge" | "clear"
  const [errorMsg, setErrorMsg] = useState("");

  if (!patient) return null;

  const stage = patient.surgery_stage || null;

  async function run(action, request) {
    setBusy(action);
    setErrorMsg("");
    try {
      onPatientUpdated?.(await request());
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not update the surgical status.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  const handleMark = () =>
    run("mark", () =>
      markSurgeryRequired(patient.id, { observation_days: Number(days) || undefined })
    );
  const handleClear = () => run("clear", () => clearSurgery(patient.id));
  const handleComplete = () =>
    run("complete", () =>
      completeSurgery(patient.id, { observation_days: Number(days) || undefined })
    );
  const handleDischarge = () => run("discharge", () => dischargePatient(patient.id));

  const disabled = !canManage || busy !== null;

  const observationEnd = patient.observation_ends_at
    ? new Date(patient.observation_ends_at).toLocaleString()
    : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HiOutlineScissors className="h-5 w-5 text-brand-600" />
          <h2 className="text-base font-semibold text-slate-900">Surgical status</h2>
        </div>
        <StageBadge stage={stage} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {stage === null && (
        <div className="mt-4">
          <p className="text-sm text-slate-500">
            This case does not need surgery, so no nurse is assigned. Nursing care is
            the watch over the days after an operation — mark the case below if this
            patient is going to theatre.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <ObservationDaysField value={days} onChange={setDays} disabled={disabled} />
            <button
              onClick={handleMark}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiOutlineScissors className="h-4.5 w-4.5" />
              {busy === "mark" ? "Saving…" : "Surgery required"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {stage === "required" && (
        <div className="mt-4">
          <p className="text-sm text-slate-500">
            {hasActiveAssignment
              ? "A nurse is assigned and will watch this patient through recovery. Mark the surgery completed once it is done — that starts the observation period."
              : "Assign the nurse who will watch this patient after the operation, then mark the surgery completed when it is done."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!hasActiveAssignment && (
              <button
                onClick={onAssignNurse}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <HiOutlineHeart className="h-4.5 w-4.5" />
                Assign nurse
              </button>
            )}

            <button
              onClick={() => setConfirming("complete")}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiOutlineCheckCircle className="h-4.5 w-4.5" />
              {busy === "complete" ? "Saving…" : "Surgery completed"}
            </button>

            {/* Only while nobody is watching the patient yet — the API
                refuses this once an assignment is live, and says so. */}
            {!hasActiveAssignment && (
              <button
                onClick={handleClear}
                disabled={disabled}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "clear" ? "Removing…" : "Not a surgery case"}
              </button>
            )}
          </div>

          <div className="mt-3">
            <ObservationDaysField value={days} onChange={setDays} disabled={disabled} />
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {stage === "post_op" && (
        <div className="mt-4">
          <div className="rounded-xl bg-brand-50/60 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-brand-800">
              <HiOutlineClock className="h-4.5 w-4.5 shrink-0" />
              Post-operative observation
              {patient.observation_days_left != null &&
                ` — ${patient.observation_days_left} day${
                  patient.observation_days_left === 1 ? "" : "s"
                } left`}
            </p>
            {observationEnd && (
              <p className="mt-1 text-xs text-slate-500">
                Planned to run until {observationEnd}. The patient stays on the nurse&apos;s
                list until they are discharged — the date passing is a prompt, not a
                discharge.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!hasActiveAssignment && (
              <button
                onClick={onAssignNurse}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <HiOutlineHeart className="h-4.5 w-4.5" />
                Assign nurse
              </button>
            )}
            <DischargeButton
              busy={busy === "discharge"}
              disabled={disabled}
              onClick={() => setConfirming("discharge")}
            />
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {stage === "ready_for_discharge" && (
        <div className="mt-4">
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
              <HiOutlineCheckCircle className="h-4.5 w-4.5 shrink-0" />
              Observation period complete — ready for discharge
            </p>
            <p className="mt-1 text-xs text-emerald-700/80">
              Review the nurse&apos;s observations, then discharge. Nothing closes on its
              own: a patient still recovering stays under the nurse until you say so.
            </p>
          </div>

          <div className="mt-3">
            <DischargeButton
              busy={busy === "discharge"}
              disabled={disabled}
              onClick={() => setConfirming("discharge")}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {!canManage && (
        <p className="mt-4 text-xs text-slate-400">
          Only the treating doctor can change the surgical status.
        </p>
      )}

      {confirming === "complete" && (
        <ConfirmDialog
          title="Mark the surgery completed?"
          message={
            `${patient.name} moves to post-operative observation for ` +
            `${Number(days) || DEFAULT_OBSERVATION_DAYS} day` +
            `${(Number(days) || DEFAULT_OBSERVATION_DAYS) === 1 ? "" : "s"}. ` +
            "The assigned nurse keeps the patient on their list and goes on recording " +
            "vitals, observations and recovery until you discharge them."
          }
          confirmLabel="Surgery completed"
          cancelLabel="Cancel"
          busy={busy === "complete"}
          onCancel={() => setConfirming(null)}
          onConfirm={handleComplete}
        />
      )}

      {confirming === "discharge" && (
        <ConfirmDialog
          title={`Discharge ${patient.name}?`}
          message={
            "The observation period ends and the nursing assignment is closed — the " +
            "patient comes off the nurse's list. Everything logged so far stays on the " +
            "timeline for audit."
          }
          confirmLabel="Discharge patient"
          cancelLabel="Cancel"
          busy={busy === "discharge"}
          onCancel={() => setConfirming(null)}
          onConfirm={handleDischarge}
        />
      )}
    </div>
  );
}

function DischargeButton({ busy, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <HiOutlineArrowRightOnRectangle className="h-4.5 w-4.5" />
      {busy ? "Discharging…" : "Discharge patient"}
    </button>
  );
}

function ObservationDaysField({ value, onChange, disabled }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">
        Observe for (days)
      </label>
      <input
        type="number"
        min="1"
        max="90"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
      />
      <p className="mt-1 text-[11px] text-slate-400">
        Defaults to {DEFAULT_OBSERVATION_DAYS} days after surgery.
      </p>
    </div>
  );
}

const STAGE_LABELS = {
  required: ["Surgery required", "bg-amber-100 text-amber-700"],
  post_op: ["Post-operative observation", "bg-brand-50 text-brand-700"],
  ready_for_discharge: ["Ready for discharge", "bg-emerald-100 text-emerald-700"],
};

function StageBadge({ stage }) {
  const [label, tone] = STAGE_LABELS[stage] || [
    "No surgery planned",
    "bg-slate-100 text-slate-600",
  ];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>
  );
}
