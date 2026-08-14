import { useState } from "react";
import { HiOutlineCheckCircle } from "react-icons/hi2";
import Modal from "../Modal";
import { dischargeAssignment } from "../../services/nursingService";

/**
 * Ends nursing care for a patient.
 *
 * Shown to the assigned nurse and the treating doctor, because either can be
 * the one who knows it is finished. Nothing else closes an assignment — the
 * planned observation window passing has no effect, so a patient stays on the
 * nurse's list until somebody here says otherwise.
 */
export default function DischargeModal({ assignment, canCancel, onClose, onDone }) {
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(status) {
    setSaving(true);
    setErrorMsg("");
    try {
      await dischargeAssignment(assignment.id, { status, summary });
      onDone();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not close this assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`End nursing care for ${assignment.patient}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          {assignment.patient} comes off the nursing list and the record is
          closed. Everything logged so far stays on the timeline for audit.
        </p>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Closing note (optional)
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Wound healed, mobile and eating normally. Discharged on oral antibiotics."
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Added to the patient&apos;s nursing notes, so the reason stays on the
            record rather than only in the audit log.
          </p>
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="button"
          onClick={() => submit("completed")}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          <HiOutlineCheckCircle className="h-4.5 w-4.5" />
          {saving ? "Saving…" : "Mark completed & discharge"}
        </button>

        {/* Cancelling says the hand-off should not have happened, which is
            undoing the doctor's own decision — so it is theirs alone. */}
        {canCancel && (
          <button
            type="button"
            onClick={() => submit("cancelled")}
            disabled={saving}
            className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel this assignment instead
          </button>
        )}
      </div>
    </Modal>
  );
}
