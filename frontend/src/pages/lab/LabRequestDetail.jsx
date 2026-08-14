import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  HiArrowLeft,
  HiOutlineArrowDownTray,
  HiOutlineArrowPathRoundedSquare,
  HiOutlineArrowUpTray,
  HiOutlineCheckBadge,
  HiOutlineXCircle,
} from "react-icons/hi2";
import Avatar from "../../components/Avatar";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal from "../../components/Modal";
import { RecordDetail } from "../../components/RecordCard";
import LabDiscussion from "../../components/lab/LabDiscussion";
import {
  LabProgress,
  LabStatusBadge,
  PriorityBadge,
  RecollectionBadge,
  formatWhen,
} from "../../components/lab/LabBits";
import {
  downloadLabReport,
  fetchLabRequest,
  requestRecollection,
  setLabStatus,
  uploadLabReport,
} from "../../services/labService";

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

// What the technician's single action button offers next, per current state.
// A map rather than a chain of conditionals so the flow is readable in one
// place and cannot disagree with the server's own ordering.
const NEXT_STEP = {
  ordered: { status: "sample_collected", label: "Mark sample collected" },
  sample_collected: { status: "processing", label: "Start processing" },
};

function UploadReportModal({ request, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState(request.result_summary || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const saved = await uploadLabReport(request.id, file, summary);
      onUploaded(saved);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not upload that report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={request.has_report ? "Replace the report" : "Upload the report"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Report file *
          </label>
          <input
            ref={inputRef}
            required
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700"
          />
          <p className="mt-1 text-xs text-slate-400">PDF or image, up to 10 MB.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Result summary
          </label>
          <textarea
            rows={3}
            className={inputClass}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="The headline finding, so the doctor sees it without opening the file."
          />
        </div>

        {errorMsg && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
        )}

        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Uploading marks this test <strong>completed</strong> and notifies{" "}
          {request.doctor || "the requesting doctor"}.
        </p>

        <button
          type="submit"
          disabled={saving || !file}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Uploading…" : "Upload and notify"}
        </button>
      </form>
    </Modal>
  );
}

function RecollectionModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      onDone(await requestRecollection(request.id, reason.trim()));
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not request a recollection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Request a fresh sample" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-slate-600">
          This puts the test back to <strong>Ordered</strong> — which is where it really is,
          since it is waiting on a sample again — and tells{" "}
          {request.doctor || "the requesting doctor"} why.
        </p>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Reason *</label>
          <textarea
            required
            rows={3}
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Sample haemolysed; insufficient volume; tube mislabelled"
          />
        </div>
        {errorMsg && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
        )}
        <button
          type="submit"
          disabled={saving || !reason.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Sending…" : "Request recollection"}
        </button>
      </form>
    </Modal>
  );
}

/**
 * One lab test: what was asked for, where it has got to, the result, and the
 * discussion between the doctor who ordered it and the technician running it.
 *
 * Which controls appear is decided by the server, which returns `can_process`,
 * `can_verify` and `can_discuss` alongside the request. The page renders what
 * it is told rather than re-deriving the rules from the role — the two could
 * drift, and the server's answer is the one that counts.
 */
export default function LabRequestDetail({ basePath = "/lab/requests" }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recollecting, setRecollecting] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetchLabRequest(id)
      .then((data) => {
        setRequest(data);
        setErrorMsg("");
      })
      .catch((err) =>
        setErrorMsg(err.response?.data?.message || "Could not load that lab request.")
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function advance(status) {
    setBusy(true);
    setErrorMsg("");
    try {
      setRequest(await setLabStatus(id, status));
      setConfirming(null);
      // Reload so the new system entry appears in the history below.
      load();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not update that test.");
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    try {
      await downloadLabReport(id, request.report_name || "lab_report.pdf");
    } catch {
      setErrorMsg("Could not download that report.");
    }
  }

  if (loading && !request) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (!request) {
    return (
      <div>
        <button
          onClick={() => navigate(basePath)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <HiArrowLeft className="h-4 w-4" />
          Back to lab tests
        </button>
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMsg || "That lab request could not be found."}
        </p>
      </div>
    );
  }

  const next = request.can_process ? NEXT_STEP[request.status] : null;
  const canComplete = request.can_process && request.status === "processing";
  const canRecollect =
    request.can_process && !["verified", "cancelled"].includes(request.status);

  return (
    <div>
      <button
        onClick={() => navigate(basePath)}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <HiArrowLeft className="h-4 w-4" />
        Back to lab tests
      </button>

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start gap-3">
              <Avatar name={request.patient} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-bold text-slate-900">{request.patient}</h1>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {[
                    request.patient_code,
                    request.patient_age != null && `${request.patient_age} yrs`,
                    request.patient_gender,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <p className="mt-4 break-words text-lg font-semibold text-slate-800">
              {request.test_name}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LabStatusBadge status={request.status} />
              <PriorityBadge priority={request.priority} />
              <RecollectionBadge request={request} />
            </div>

            <LabProgress status={request.status} />

            {request.recollection_requested && request.recollection_reason && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">A fresh sample is needed:</span>{" "}
                {request.recollection_reason}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <RecordDetail label="Category" value={request.test_category} />
              <RecordDetail label="Specimen" value={request.specimen} />
              <RecordDetail label="Ordered by" value={request.doctor} />
              <RecordDetail label="Technician" value={request.technician || "Unassigned"} />
            </div>

            {request.clinical_notes && (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Clinical notes
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                  {request.clinical_notes}
                </p>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400">
              Ordered {formatWhen(request.created_at)}
              {request.verified_at &&
                ` · Verified by ${request.verified_by} ${formatWhen(request.verified_at)}`}
            </p>
          </div>

          {/* ---- result ---- */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Result</h2>

            {request.has_report ? (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  {request.report_name}
                  <span className="text-slate-400">
                    {" "}
                    · filed {formatWhen(request.report_uploaded_at)}
                  </span>
                </p>
                {request.result_summary && (
                  <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {request.result_summary}
                  </p>
                )}
                <button
                  onClick={handleDownload}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                >
                  <HiOutlineArrowDownTray className="h-4 w-4" />
                  Download report
                </button>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                No report has been filed yet.
              </p>
            )}

            {/* ---- actions ---- */}
            {(next || canComplete || canRecollect || request.can_verify) && (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {next && (
                  <button
                    onClick={() => advance(next.status)}
                    disabled={busy}
                    className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
                  >
                    {next.label}
                  </button>
                )}

                {request.can_process && !["verified", "cancelled"].includes(request.status) && (
                  <button
                    onClick={() => setUploading(true)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <HiOutlineArrowUpTray className="h-4 w-4" />
                    {request.has_report ? "Replace report" : "Upload report"}
                  </button>
                )}

                {canRecollect && (
                  <button
                    onClick={() => setRecollecting(true)}
                    className="flex items-center gap-2 rounded-xl border border-amber-200 px-3.5 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
                  >
                    <HiOutlineArrowPathRoundedSquare className="h-4 w-4" />
                    Request recollection
                  </button>
                )}

                {/* Accepting the result is the ordering doctor's call, which
                    is why this button never appears for the technician. */}
                {request.can_verify && request.status === "completed" && (
                  <button
                    onClick={() => setConfirming("verified")}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
                  >
                    <HiOutlineCheckBadge className="h-4 w-4" />
                    Verify result
                  </button>
                )}

                {request.can_verify && request.is_open && (
                  <button
                    onClick={() => setConfirming("cancelled")}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-xl border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    <HiOutlineXCircle className="h-4 w-4" />
                    Cancel test
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <LabDiscussion
          requestId={request.id}
          canDiscuss={request.can_discuss}
          onPosted={load}
        />
      </div>

      {uploading && (
        <UploadReportModal
          request={request}
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            load();
          }}
        />
      )}

      {recollecting && (
        <RecollectionModal
          request={request}
          onClose={() => setRecollecting(false)}
          onDone={() => {
            setRecollecting(false);
            load();
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming === "verified" ? "Verify this result?" : "Cancel this test?"}
          message={
            confirming === "verified"
              ? `This accepts ${request.test_name} for ${request.patient} as final and closes the request. The report and the discussion stay on the patient's record.`
              : `This closes ${request.test_name} for ${request.patient} without a result. The lab will be told.`
          }
          confirmLabel={confirming === "verified" ? "Verify" : "Cancel test"}
          cancelLabel="Go back"
          destructive={confirming === "cancelled"}
          busy={busy}
          onConfirm={() => advance(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
