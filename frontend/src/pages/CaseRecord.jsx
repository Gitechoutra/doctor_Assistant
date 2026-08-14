import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  HiArrowLeft,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineMicrophone,
} from "react-icons/hi2";
import CaseSessionCard from "../components/CaseSessionCard";
import CaseSummaryPanel from "../components/CaseSummaryPanel";
import ConfirmDialog from "../components/ConfirmDialog";
import PatientInfoPanel from "../components/PatientInfoPanel";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { closeCase, fetchCase, reopenCase } from "../services/caseService";
import { startConsultation } from "../services/consultationService";

function StatusBadge({ status }) {
  const open = status === "open";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        open ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
      }`}
    >
      {open ? "In treatment" : "Treatment closed"}
    </span>
  );
}

export default function CaseRecord() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [caseRecord, setCaseRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // "start" | "close" | "reopen"
  const [confirming, setConfirming] = useState(null); // "close" | "reopen"
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchCase(id)
        .then(setCaseRecord)
        .catch(() => setErrorMsg("Could not load this case."))
        .finally(() => setLoading(false));
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A session ending elsewhere (or another device) changes this timeline.
  useLiveRefresh(() => load(true));

  async function run(action, request) {
    setBusy(action);
    setErrorMsg("");
    try {
      setCaseRecord(await request());
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not complete that action.");
    } finally {
      setBusy(null);
    }
  }

  // Starting the next session creates a brand-new consultation on this same
  // case — nothing already recorded is touched — and drops the doctor
  // straight into the recording room for it.
  async function handleStartNextSession() {
    setBusy("start");
    setErrorMsg("");
    try {
      const consultation = await startConsultation(caseRecord.patient_id);
      navigate(`/dashboard/consultations/${consultation.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not start the next session.");
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  if (!caseRecord) {
    return <p className="text-sm text-slate-400">{errorMsg || "Case not found."}</p>;
  }

  const isOpen = caseRecord.status === "open";
  const canManage = Boolean(caseRecord.can_manage);
  const sessions = caseRecord.sessions || [];
  const openSessionId = caseRecord.open_session_id;
  const todaysSessionId = caseRecord.todays_session_id;
  const completed = caseRecord.completed_session_count;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => navigate("/dashboard/cases")}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <HiArrowLeft className="h-4 w-4" />
          Back to cases
        </button>

        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            {isOpen ? (
              <>
                {openSessionId ? (
                  // A session is already recording — offering "start next"
                  // here would only produce a 409, so send them to it instead.
                  <button
                    onClick={() => navigate(`/dashboard/consultations/${openSessionId}`)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
                  >
                    <HiOutlineMicrophone className="h-4.5 w-4.5" />
                    Resume current session
                  </button>
                ) : todaysSessionId ? (
                  // Seen today already: today's visit is one session, so more
                  // conversation goes into it rather than into a new one.
                  <button
                    onClick={() => navigate(`/dashboard/consultations/${todaysSessionId}`)}
                    title="This patient was already seen today — carry on with that consultation"
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
                  >
                    <HiOutlineMicrophone className="h-4.5 w-4.5" />
                    Continue today's session ({caseRecord.todays_session_number})
                  </button>
                ) : (
                  <button
                    onClick={handleStartNextSession}
                    disabled={busy !== null}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
                  >
                    <HiOutlineMicrophone className="h-4.5 w-4.5" />
                    {busy === "start" ? "Starting…" : `Start session ${completed + 1}`}
                  </button>
                )}

                <button
                  onClick={() => setConfirming("close")}
                  disabled={busy !== null || completed === 0 || Boolean(openSessionId)}
                  title={
                    openSessionId
                      ? "End the session in progress first"
                      : completed === 0
                        ? "Complete at least one session first"
                        : "Finish treatment and generate the consolidated report"
                  }
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <HiOutlineCheckCircle className="h-4.5 w-4.5" />
                  {busy === "close" ? "Consolidating…" : "End treatment & consolidate"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirming("reopen")}
                disabled={busy !== null}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <HiOutlineArrowPath className="h-4.5 w-4.5" />
                {busy === "reopen" ? "Reopening…" : "Reopen for another session"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{caseRecord.patient}</h1>
          <StatusBadge status={caseRecord.status} />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
            {caseRecord.code}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {completed} completed session{completed === 1 ? "" : "s"}
          {caseRecord.doctor && ` · ${caseRecord.doctor}`}
          {caseRecord.opened_at &&
            ` · opened ${new Date(caseRecord.opened_at).toLocaleDateString()}`}
          {caseRecord.closed_at &&
            ` · closed ${new Date(caseRecord.closed_at).toLocaleDateString()}`}
        </p>
        {caseRecord.reason && (
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-medium text-slate-600">Reason:</span> {caseRecord.reason}
          </p>
        )}
      </div>

      {errorMsg && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <PatientInfoPanel patient={caseRecord.patient_detail} />

        <div className="space-y-6">
          <div>
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Consultation sessions
            </h2>
            {sessions.length === 0 ? (
              <p className="rounded-2xl border border-slate-100 bg-white py-12 text-center text-sm text-slate-400 shadow-sm">
                No sessions recorded on this case yet.
              </p>
            ) : (
              <div className="space-y-4">
                {sessions.map((session, index) => (
                  <CaseSessionCard
                    key={session.id}
                    session={session}
                    isLatest={index === sessions.length - 1}
                    // The newest session is what a doctor opening the case
                    // wants to read; older ones stay collapsed.
                    defaultExpanded={index === sessions.length - 1 && sessions.length > 1}
                  />
                ))}
              </div>
            )}
          </div>

          {caseRecord.consolidated ? (
            <CaseSummaryPanel
              caseRecord={caseRecord}
              canManage={canManage}
              onCaseUpdated={setCaseRecord}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <p className="text-sm font-medium text-slate-600">
                No consolidated report yet
              </p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-slate-400">
                {completed === 0
                  ? "Complete a consultation session first."
                  : canManage
                    ? "When this patient's treatment is finished, end the treatment above. Every session is merged into one report with a single final prescription."
                    : "The treating doctor produces this when the course of treatment ends."}
              </p>
            </div>
          )}
        </div>
      </div>

      {confirming === "close" && (
        <ConfirmDialog
          title="End treatment & consolidate"
          message={
            `This closes ${caseRecord.patient}'s course of treatment and merges all ${completed} ` +
            "session(s) into one report with a single final prescription. Each session keeps its " +
            "own record unchanged, and you can reopen the case later if more sessions are needed."
          }
          confirmLabel="End treatment"
          cancelLabel="Cancel"
          busy={busy === "close"}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            setConfirming(null);
            await run("close", () => closeCase(id));
          }}
        />
      )}

      {confirming === "reopen" && (
        <ConfirmDialog
          title="Reopen this case"
          message={
            "Reopening clears the consolidated report and its signature, since the course of " +
            "treatment is no longer finished. The individual sessions are untouched, and closing " +
            "the case again regenerates the report over all sessions."
          }
          confirmLabel="Reopen"
          cancelLabel="Cancel"
          busy={busy === "reopen"}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            setConfirming(null);
            await run("reopen", () => reopenCase(id));
          }}
        />
      )}
    </div>
  );
}
