import { useState } from "react";
import {
  HiOutlineBeaker,
  HiOutlineExclamationTriangle,
  HiOutlinePlus,
} from "react-icons/hi2";
import Modal from "../Modal";
import { DoseFields, DoseInstructions, TONES } from "./PrescriptionList";
import { DoseBadge, EMERGENCY_SEVERITY_LABELS, formatWhen } from "./NursingBadges";
import {
  addMedicationOrder,
  isoToLocalInput,
  localInputToIso,
  recordAdministration,
} from "../../services/nursingService";

const ROUTES = [
  { value: "oral", label: "Tablet / Oral" },
  { value: "injection", label: "Injection" },
  { value: "iv", label: "IV / Saline" },
  { value: "topical", label: "Topical" },
  { value: "inhalation", label: "Inhalation" },
  { value: "other", label: "Other" },
];

// Mirrors the server's enum. "Delayed" still counts as given; "missed" and
// "skipped" do not, and "missed" raises an alert to the doctor on its own.
const STATUSES = [
  { value: "completed", label: "Completed", hint: "Given on time" },
  { value: "delayed", label: "Delayed", hint: "Given, but late" },
  { value: "missed", label: "Missed", hint: "Not given — flags the doctor" },
  { value: "skipped", label: "Skipped", hint: "Deliberately withheld" },
];

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

function LogDoseModal({ assignmentId, order, onClose, onLogged }) {
  const [form, setForm] = useState({
    status: "completed",
    // Pre-filled with now: the common case is logging a dose as it's given,
    // and re-typing the current time every round is friction with no upside.
    administered_at: isoToLocalInput(),
    scheduled_at: "",
    dose: order?.dose || "",
    medicine_name: order?.medicine_name || "",
    route: order?.route || "oral",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const wasGiven = form.status === "completed" || form.status === "delayed";
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const result = await recordAdministration(assignmentId, {
        order_id: order?.id ?? null,
        medicine_name: form.medicine_name,
        route: form.route,
        dose: form.dose,
        status: form.status,
        // A dose that wasn't given must not carry an administered time; the
        // server drops it anyway, this just keeps the request honest.
        administered_at: wasGiven ? localInputToIso(form.administered_at) : null,
        scheduled_at: localInputToIso(form.scheduled_at),
        notes: form.notes,
      });
      onLogged(result);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save this entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={order ? `Log ${order.medicine_name}` : "Log an unscheduled dose"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {!order && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Medicine *</label>
              <input
                required
                className={inputClass}
                value={form.medicine_name}
                onChange={update("medicine_name")}
                placeholder="e.g. Paracetamol 650mg"
              />
            </div>
            <div>
              <label className={labelClass}>Route</label>
              <select className={inputClass} value={form.route} onChange={update("route")}>
                {ROUTES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>Outcome *</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, status: s.value }))}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  form.status === s.value
                    ? "border-brand-400 bg-brand-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="block text-sm font-semibold text-slate-800">{s.label}</span>
                <span className="block text-[11px] text-slate-500">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Dose given</label>
            <input
              className={inputClass}
              value={form.dose}
              onChange={update("dose")}
              placeholder="e.g. 1 tablet"
            />
          </div>
          <div>
            <label className={labelClass}>Scheduled for</label>
            <input
              type="datetime-local"
              className={inputClass}
              value={form.scheduled_at}
              onChange={update("scheduled_at")}
            />
          </div>
        </div>

        {wasGiven && (
          <div>
            <label className={labelClass}>Administered at *</label>
            <input
              type="datetime-local"
              required
              className={inputClass}
              value={form.administered_at}
              onChange={update("administered_at")}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>
            Notes {form.status === "skipped" || form.status === "missed" ? "(why?)" : "(optional)"}
          </label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.notes}
            onChange={update("notes")}
            placeholder={
              form.status === "missed"
                ? "The doctor is alerted with this note — say what happened."
                : "Anything the doctor should know"
            }
          />
        </div>

        {form.status === "missed" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Marking this missed raises an alert with the treating doctor straight away.
          </p>
        )}

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save entry"}
        </button>
      </form>
    </Modal>
  );
}

function AddMedicationModal({ assignmentId, onClose, onAdded }) {
  const [form, setForm] = useState({
    medicine_name: "",
    route: "oral",
    dose: "",
    frequency: "",
    duration: "",
    times_per_day: "",
    instructions: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      onAdded(await addMedicationOrder(assignmentId, form));
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not add this medication.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add to the medication schedule" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelClass}>Medicine *</label>
          <input
            required
            className={inputClass}
            value={form.medicine_name}
            onChange={update("medicine_name")}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Route</label>
            <select className={inputClass} value={form.route} onChange={update("route")}>
              {ROUTES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Dose</label>
            <input className={inputClass} value={form.dose} onChange={update("dose")} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Frequency</label>
            <input className={inputClass} value={form.frequency} onChange={update("frequency")} />
          </div>
          <div>
            <label className={labelClass}>Duration</label>
            <input className={inputClass} value={form.duration} onChange={update("duration")} />
          </div>
          <div>
            <label className={labelClass}>Doses / day</label>
            {/* Drives the "2 of 3 doses logged today" reading. Left blank for
                an as-needed medicine, which is never counted as behind. */}
            <input
              type="number"
              min="1"
              max="24"
              className={inputClass}
              value={form.times_per_day}
              onChange={update("times_per_day")}
              placeholder="PRN"
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Instructions for the nurse</label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.instructions}
            onChange={update("instructions")}
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add medication"}
        </button>
      </form>
    </Modal>
  );
}

// Doses actually given for one order since midnight — same UTC day boundary
// the server uses for `assignment.today`, so this list and the "X/Y today"
// count next to it never disagree. "Given", not scheduled: a missed or
// skipped entry was never administered, so it has no time to show here.
function todaysGivenDoses(administrations, orderId) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  return administrations
    .filter(
      (a) =>
        a.order_id === orderId &&
        (a.status === "completed" || a.status === "delayed") &&
        new Date(a.administered_at || a.created_at) >= since
    )
    .sort((a, b) => new Date(a.administered_at) - new Date(b.administered_at));
}

/**
 * The medication schedule and the log of every dose against it.
 *
 * `canRecord` is the assigned nurse (logs doses); `canManagePlan` is the
 * treating doctor (edits the schedule). Neither can do the other's job — the
 * server enforces the same split.
 */
export default function MedicationPanel({ assignment, canRecord, canManagePlan, onChanged }) {
  const [logging, setLogging] = useState(null); // { order } | { order: null }
  const [adding, setAdding] = useState(false);

  const today = assignment.today;
  const progressByOrder = new Map((today?.orders || []).map((o) => [o.order_id, o]));
  const activeOrders = assignment.medication_orders.filter((o) => o.is_active);
  const stoppedOrders = assignment.medication_orders.filter((o) => !o.is_active);

  // For an emergency admission this schedule *is* the prescription — the
  // claiming doctor entered it at the hand-off and there is no consultation
  // for it to have come from. Marked as such throughout so a nurse holding a
  // mixed ward list is never in doubt which orders they are looking at.
  const emergency = assignment.emergency;
  const tone = TONES[emergency ? "emergency" : "normal"];

  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl bg-white p-6 shadow-sm ${
          emergency ? "border-2 border-red-200" : "border border-slate-100"
        }`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              className={`flex items-center gap-2 text-base font-semibold ${
                emergency ? "font-bold text-red-900" : "text-slate-900"
              }`}
            >
              {emergency && <HiOutlineExclamationTriangle className="h-5 w-5" />}
              {emergency ? "Emergency prescription" : "Medication schedule"}
            </h2>
            {emergency && (
              <p className="mt-0.5 text-xs font-semibold text-red-600">
                {emergency.code}
                {emergency.severity
                  ? ` · ${EMERGENCY_SEVERITY_LABELS[emergency.severity] || emergency.severity}`
                  : ""}
                {" · "}
                {emergency.reason}
              </p>
            )}
            {today && (
              <p className="mt-0.5 text-sm text-slate-500">
                {today.logged} of {today.expected || "—"} doses logged today
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canRecord && (
              <button
                onClick={() => setLogging({ order: null })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Unscheduled dose
              </button>
            )}
            {canManagePlan && (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
              >
                <HiOutlinePlus className="h-4 w-4" />
                Add medication
              </button>
            )}
          </div>
        </div>

        {activeOrders.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Nothing on the schedule yet.
            {canManagePlan
              ? " Add the medicines this patient needs during recovery."
              : emergency
                ? // Silence on an emergency admission is worth chasing, not
                  // waiting out: the doctor may still be on the case.
                  " Message the doctor if you are expecting emergency orders."
                : ""}
          </p>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((order) => {
              const progress = progressByOrder.get(order.id);
              const remaining = progress?.remaining;
              const givenToday = todaysGivenDoses(assignment.administrations, order.id);
              return (
                <div key={order.id} className={`rounded-xl border p-4 ${tone.card}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className={`text-base font-semibold ${tone.name}`}>
                        {order.medicine_name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}
                      >
                        {order.route_label}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`text-xs font-semibold ${
                          remaining ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        {order.times_per_day
                          ? `${progress?.logged || 0} of ${order.times_per_day} given today`
                          : "As needed"}
                      </span>
                      {canRecord && (
                        <button
                          onClick={() => setLogging({ order })}
                          className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                        >
                          Log dose
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Every value labelled, and the same four the prescription
                      itself shows — so cross-checking the schedule against
                      what the doctor wrote is reading the same thing twice,
                      not translating between two layouts. */}
                  <DoseFields item={order} tone={tone} className="mt-3" />
                  <DoseInstructions item={order} tone={tone} className="mt-3" />

                  {/* Doses actually given today, with their real logged
                      times — not a predicted schedule, since the plan only
                      ever says how many times a day, never the clock time. */}
                  {givenToday.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-600">Given today:</span>{" "}
                      {givenToday
                        .map(
                          (d) =>
                            `${d.dose || order.dose || "Dose"} at ${formatWhen(
                              d.administered_at || d.created_at,
                              { withDate: false }
                            )}`
                        )
                        .join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}

            {stoppedOrders.length > 0 && (
              <p className="pt-1 text-xs text-slate-400">
                {stoppedOrders.length} stopped:{" "}
                {stoppedOrders.map((o) => o.medicine_name).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
          <HiOutlineBeaker className="h-5 w-5 text-slate-400" />
          Administration log
        </h2>

        {assignment.administrations.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            No doses recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Medicine</th>
                  <th className="py-2 font-medium">Route</th>
                  <th className="py-2 font-medium">Given at</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">By</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {assignment.administrations.map((record) => (
                  <tr key={record.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-800">{record.medicine_name}</td>
                    <td className="py-2.5 text-slate-500">{record.route_label}</td>
                    <td className="py-2.5 text-slate-500">
                      {formatWhen(record.administered_at || record.created_at)}
                      {record.delay_minutes > 0 && (
                        <span className="ml-1 text-amber-600">
                          (+{record.delay_minutes}m)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <DoseBadge status={record.status} />
                    </td>
                    <td className="py-2.5 text-slate-500">{record.nurse || "—"}</td>
                    <td className="max-w-xs py-2.5 text-slate-500">{record.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logging && (
        <LogDoseModal
          assignmentId={assignment.id}
          order={logging.order}
          onClose={() => setLogging(null)}
          onLogged={() => {
            setLogging(null);
            onChanged();
          }}
        />
      )}

      {adding && (
        <AddMedicationModal
          assignmentId={assignment.id}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
