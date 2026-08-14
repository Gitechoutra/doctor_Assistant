import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineInboxStack,
  HiOutlineXMark,
} from "react-icons/hi2";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal from "../../components/Modal";
import MedicineForm from "../../components/pharmacy/MedicineForm";
import { ROUTE_LABELS } from "../../constants/medicines";
import {
  addRequestedMedicine,
  dismissMedicineRequest,
  fetchMedicineRequests,
} from "../../services/pharmacyService";

const TABS = [
  { value: "pending", label: "Needs details" },
  { value: "added", label: "Completed" },
  { value: "dismissed", label: "Rejected" },
  { value: "all", label: "All" },
];


const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-800",
  added: "bg-emerald-100 text-emerald-700",
  dismissed: "bg-slate-200 text-slate-600",
};

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-slate-700">{value}</p>
    </div>
  );
}

function RequestCard({ request, onAdd, onDismiss }) {
  const pending = request.status === "pending";

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        pending ? "border-amber-200" : "border-slate-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{request.medicine_name}</p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                STATUS_STYLE[request.status]
              }`}
            >
              {request.status === "pending"
                ? "In catalogue · needs details"
                : request.status === "added"
                  ? "Completed"
                  : "Rejected"}
            </span>
            {/* How many times it has been needed — the argument for adding it. */}
            <span
              title="Times a doctor prescribed this by hand"
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
            >
              Prescribed {request.times_prescribed}×
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-400">
            Added by {request.requested_by || "a doctor"}
            {request.department && ` · ${request.department}`}
            {request.last_requested_at &&
              ` · last on ${new Date(request.last_requested_at).toLocaleDateString()}`}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Detail label="Dosage" value={request.dose} />
            <Detail label="Frequency" value={request.frequency} />
            <Detail label="Route" value={ROUTE_LABELS[request.route] || request.route} />
            <Detail label="Strength" value={request.strength} />
          </div>

          {request.instructions && (
            <div className="mt-3">
              <Detail label="Instructions given" value={request.instructions} />
            </div>
          )}
          {request.notes && (
            <p className="mt-2 text-xs italic text-slate-400">
              Doctor's note: {request.notes}
            </p>
          )}
          {request.review_note && (
            <p className="mt-2 text-xs text-slate-500">
              Review note: {request.review_note}
            </p>
          )}
          {request.reviewed_by && (
            <p className="mt-1 text-[11px] text-slate-400">
              Reviewed by {request.reviewed_by}
              {request.reviewed_at &&
                ` on ${new Date(request.reviewed_at).toLocaleDateString()}`}
            </p>
          )}
        </div>

        {pending && (
          <div className="flex shrink-0 flex-col gap-2">
            <button
              onClick={() => onAdd(request)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:shadow-lg"
            >
              <HiOutlineCheckCircle className="h-4 w-4" />
              Complete details
            </button>
            <button
              onClick={() => onDismiss(request)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Medicines doctors prescribed that the catalogue does not have.
 *
 * The other half of manual entry: doctors are never blocked by the inventory,
 * and in exchange every medicine they type by hand arrives here for a
 * decision. Adding one closes the gap so the next doctor finds it in search.
 */
export default function MedicineRequests() {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [noticeMsg, setNoticeMsg] = useState("");

  const [adding, setAdding] = useState(null);
  const [dismissing, setDismissing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchMedicineRequests(status)
        .then((data) => {
          setRequests(data.items || []);
          setPendingCount(data.pending ?? 0);
          setErrorMsg("");
        })
        .catch((err) =>
          setErrorMsg(err.response?.data?.message || "Could not load requests.")
        )
        .finally(() => setLoading(false));
    },
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(payload) {
    setSaving(true);
    setFormError("");
    try {
      const result = await addRequestedMedicine(adding.id, payload);
      setAdding(null);
      setNoticeMsg(
        `${result.brand.display_name} completed — it is now a standard catalogue medicine.`
      );
      load(true);
    } catch (err) {
      setFormError(err.response?.data?.message || "Could not add this medicine.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDismiss() {
    setSaving(true);
    try {
      const result = await dismissMedicineRequest(dismissing.id, "");
      setNoticeMsg(result.message || `${dismissing.medicine_name} rejected.`);
      setDismissing(null);
      load(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not dismiss this request.");
      setDismissing(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Medicine requests</h1>
        </div>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-3.5 py-2 text-sm font-bold text-amber-800">
            {pendingCount} need details
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === t.value
                ? "bg-emerald-600 text-white shadow-md"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}
      {noticeMsg && (
        <p
          role="status"
          className="mt-5 flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <span>{noticeMsg}</span>
          <button
            onClick={() => setNoticeMsg("")}
            aria-label="Dismiss"
            className="shrink-0 text-emerald-600 hover:text-emerald-800"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        </p>
      )}

      <div className="mt-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
            <HiOutlineInboxStack className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
              {status === "pending"
                ? "Nothing outstanding — every medicine doctors added has been completed."
                : `No ${status} entries.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                onAdd={(req) => {
                  setFormError("");
                  setAdding(req);
                }}
                onDismiss={setDismissing}
              />
            ))}
          </div>
        )}
      </div>

      {adding && (
        <Modal title={`Complete ${adding.medicine_name}`} onClose={() => setAdding(null)} wide>
          <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Already in the catalogue and prescribable. Fill in what a prescription could not
            carry, and correct the name if the doctor abbreviated it. Saving marks it a
            standard catalogue medicine, so the usual stock rules apply from then on.
          </p>
          <MedicineForm
            medicine={{
              brand_name: adding.medicine_name,
              usage_instructions: adding.instructions,
              department_ids: adding.department_id ? [adding.department_id] : [],
              is_active: true,
            }}
            saving={saving}
            errorMsg={formError}
            submitLabel="Add to catalogue"
            onSubmit={handleAdd}
            onCancel={() => setAdding(null)}
          />
        </Modal>
      )}

      {dismissing && (
        <ConfirmDialog
          title={`Dismiss ${dismissing.medicine_name}?`}
          message={
            "This closes the request without adding the medicine — for a duplicate of " +
            "something already listed, a typo, or a medicine the hospital genuinely does " +
            "not stock.\n\nThe request stays on record, and if doctors keep prescribing it " +
            "by hand the count will keep rising."
          }
          confirmLabel="Dismiss"
          cancelLabel="Cancel"
          busy={saving}
          onCancel={() => setDismissing(null)}
          onConfirm={handleDismiss}
        />
      )}
    </div>
  );
}
