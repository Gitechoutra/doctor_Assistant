import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Modal from "../components/Modal";
import PatientRecord from "../components/nursing/PatientRecord";
import {
  isoToLocalInput,
  localInputToIso,
  markAssignmentSeen,
  updateAssignment,
} from "../services/nursingService";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

/** The doctor's half of the record: revise instructions, extend the watch, or
 *  discharge the patient from nursing care. */
function ManagePlanModal({ assignment, onClose, onSaved }) {
  const [form, setForm] = useState({
    treatment_plan: assignment.treatment_plan || "",
    care_instructions: assignment.care_instructions || "",
    ends_at: isoToLocalInput(assignment.ends_at),
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function save(extra = {}) {
    setSaving(true);
    setErrorMsg("");
    try {
      await updateAssignment(assignment.id, {
        treatment_plan: form.treatment_plan,
        care_instructions: form.care_instructions,
        ends_at: localInputToIso(form.ends_at),
        ...extra,
      });
      onSaved();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not update this assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Update care plan" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-3"
      >
        <div>
          <label className={labelClass}>Treatment plan</label>
          <textarea
            rows={3}
            className={inputClass}
            value={form.treatment_plan}
            onChange={update("treatment_plan")}
          />
        </div>
        <div>
          <label className={labelClass}>Care instructions for the nurse</label>
          <textarea
            rows={4}
            className={inputClass}
            value={form.care_instructions}
            onChange={update("care_instructions")}
          />
        </div>
        <div>
          <label className={labelClass}>Observation period ends</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={form.ends_at}
            onChange={update("ends_at")}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            The patient stays on the nurse&apos;s list until you close the assignment,
            even past this date — an overrun is flagged, never silently dropped.
          </p>
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>

      </form>
    </Modal>
  );
}

export default function NursingRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [managing, setManaging] = useState(null);
  const markedRef = useRef(null);

  // Opening the record is what counts as reviewing it, so the "new updates"
  // badge clears here rather than on the notification bell. Once per record,
  // not per refresh: anything the nurse logs while this page is open should
  // still stand out as new until the doctor comes back to it.
  useEffect(() => {
    if (markedRef.current === id) return;
    markedRef.current = id;
    markAssignmentSeen(id).catch(() => {});
  }, [id]);

  return (
    <>
      <PatientRecord
        assignmentId={id}
        backTo="Back to nursing care"
        onBack={() => navigate("/dashboard/nursing")}
        // Rendered into the record header, but only for the treating doctor —
        // can_manage_plan is the server's answer, not a guess from the role.
        headerExtra={(assignment, reload) =>
          assignment.can_manage_plan ? (
            <>
              <button
                onClick={() => setManaging({ assignment, reload })}
                className="w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Update care plan
              </button>
              {managing && (
                <ManagePlanModal
                  assignment={managing.assignment}
                  onClose={() => setManaging(null)}
                  onSaved={() => {
                    setManaging(null);
                    managing.reload();
                  }}
                />
              )}
            </>
          ) : null
        }
      />
    </>
  );
}
