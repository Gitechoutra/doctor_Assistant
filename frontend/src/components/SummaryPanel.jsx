import { useState } from "react";
import {
  HiOutlineAcademicCap,
  HiOutlineSparkles,
  HiOutlineArrowDownTray,
  HiOutlineCheckBadge,
  HiOutlineChevronDown,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
  HiOutlinePencilSquare,
  HiOutlinePrinter,
} from "react-icons/hi2";
import ConfirmDialog from "./ConfirmDialog";
import PrescriptionEditor from "./PrescriptionEditor";
import {
  savePrescriptions,
  unverifyPrescription,
  verifyPrescription,
} from "../services/consultationService";
import { downloadReport, generateReport, openReportForPrint } from "../services/reportService";

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-brand-700">{title}</h3>
      <div className="mt-1.5 text-sm text-slate-600">{children}</div>
    </div>
  );
}

function ConversationBubble({ turn }) {
  const isDoctor = turn.speaker === "doctor";
  return (
    <div className={`flex ${isDoctor ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          isDoctor
            ? "rounded-tl-sm bg-slate-100 text-slate-700"
            : "rounded-tr-sm bg-brand-600 text-white"
        }`}
      >
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">
          {turn.speaker}
        </p>
        {turn.text}
      </div>
    </div>
  );
}

export default function SummaryPanel({
  summary,
  prescriptions,
  consultationId,
  patientName,
  verified,
  verifiedBy,
  verifiedAt,
  canManage = true,
  onConsultationUpdated,
}) {
  const [busyAction, setBusyAction] = useState(null); // "print" | "download" | "verify" | "unlock"
  const [savingRx, setSavingRx] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingVerify, setConfirmingVerify] = useState(false);
  const [showPrecedents, setShowPrecedents] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [noticeMsg, setNoticeMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!summary) return null;

  // The doctor-approved cases the AI drew on for this prescription.
  const precedents = summary.matched_precedents || [];

  function fail(err, fallback) {
    setErrorMsg(err.response?.data?.message || fallback);
  }

  const filename = `${(patientName || "patient").replace(/\s+/g, "_")}_consultation_report.pdf`;

  // Regenerated on each use so the PDF always reflects the current
  // prescription and signature, never an older snapshot.
  function clearMessages() {
    setErrorMsg("");
    setNoticeMsg("");
    setSuccessMsg("");
  }

  async function withReport(action, run) {
    setBusyAction(action);
    clearMessages();
    try {
      const report = await generateReport(consultationId);
      await run(report);
    } catch (err) {
      fail(err, "Could not produce the PDF report.");
    } finally {
      setBusyAction(null);
    }
  }

  function handlePrint() {
    return withReport("print", async (report) => {
      const openedInTab = await openReportForPrint(report.id, filename);
      if (!openedInTab) {
        setNoticeMsg("Your browser blocked the print tab, so the PDF was downloaded instead.");
      }
    });
  }

  function handleDownload() {
    return withReport("download", (report) => downloadReport(report.id, filename));
  }

  async function runVerification(action, request, doneMessage) {
    setBusyAction(action);
    clearMessages();
    try {
      onConsultationUpdated?.(await request(consultationId));
      setSuccessMsg(doneMessage);
    } catch (err) {
      fail(err, "Could not update the verification.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmVerify() {
    setConfirmingVerify(false);
    await runVerification("verify", verifyPrescription, "Prescription Verified Successfully.");
  }

  const handleUnlock = () =>
    runVerification(
      "unlock",
      unverifyPrescription,
      "Prescription unlocked. Verify it again to enable printing."
    );

  const busy = busyAction !== null || savingRx;
  // Printing is gated on the doctor's sign-off: the PDF is what leaves the
  // hospital, so it must not exist until someone has stood behind it. The
  // API enforces the same rule, so a disabled button isn't the only guard.
  const canPrint = verified && !editing;
  const lockedReason = "Only the treating doctor can change this prescription";
  const printBlockedReason = verified
    ? "Finish editing first"
    : "Verify the prescription to enable printing";

  const hint = verified
    ? "Prescription is verified and locked. Unlock it to make further changes."
    : canManage
      ? "Review the medicines, then verify to sign them off — printing unlocks after that."
      : lockedReason;

  async function handleSavePrescription(rows) {
    setSavingRx(true);
    clearMessages();
    try {
      const updated = await savePrescriptions(consultationId, rows);
      onConsultationUpdated?.(updated);
      setEditing(false);
      setSuccessMsg("Prescription saved. Verify it to enable printing.");
    } catch (err) {
      fail(err, "Could not save the prescription.");
    } finally {
      setSavingRx(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <HiOutlineSparkles className="h-5 w-5 text-brand-600" />
        <h2 className="text-base font-semibold text-slate-900">AI Generated Summary</h2>
      </div>

      <div className="space-y-5">
        {summary.labeled_transcript?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-brand-700">Conversation</h3>
            <p className="mt-0.5 text-xs italic text-slate-400">
              AI-reconstructed from the recording — speakers were not manually tagged, so this
              is an inferred best guess.
            </p>
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              {summary.labeled_transcript.map((turn, i) => (
                <ConversationBubble key={i} turn={turn} />
              ))}
            </div>
          </div>
        )}

        {/* Where the suggestion below came from. Shown above the prescription
            rather than tucked under it: a doctor deciding whether to accept
            these medicines should know whether they are this hospital's own
            approved practice or the model's own proposal, before they read
            the list. */}
        {precedents.length > 0 && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
            <button
              onClick={() => setShowPrecedents((v) => !v)}
              aria-expanded={showPrecedents}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <HiOutlineAcademicCap className="h-5 w-5 shrink-0" />
                Informed by {precedents.length} doctor-approved case
                {precedents.length === 1 ? "" : "s"} with a similar presentation
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600">
                {showPrecedents ? "Hide" : "Review"}
                <HiOutlineChevronDown
                  className={`h-4 w-4 transition ${showPrecedents ? "rotate-180" : ""}`}
                />
              </span>
            </button>

            {showPrecedents && (
              <div className="mt-3 space-y-3">
                {precedents.map((p) => (
                  <div
                    key={p.precedent_id}
                    className="rounded-lg border border-brand-100 bg-white p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {p.diagnosis || "No diagnosis recorded"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        {Math.round((p.similarity || 0) * 100)}% match
                      </span>
                    </div>
                    {p.symptoms && (
                      <p className="mt-1 text-xs text-slate-500">{p.symptoms}</p>
                    )}
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {(p.medicines || []).map((m, i) => (
                        <li key={i}>
                          • {m.medicine_name}
                          {m.dose ? ` — ${m.dose}` : ""}
                          {m.frequency ? ` · ${m.frequency}` : ""}
                          {m.duration ? ` · ${m.duration}` : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-slate-400">
                      Approved by {p.doctor || "a doctor"}
                      {p.department ? `, ${p.department}` : ""}
                      {p.approved_at
                        ? ` on ${new Date(p.approved_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                ))}
                <p className="text-[11px] italic text-slate-400">
                  Past cases are shown without patient details. They are guidance from this
                  hospital's own approved practice, not a rule — your review decides what is
                  prescribed.
                </p>
              </div>
            )}
          </div>
        )}

        <Section title="Clinical Summary">{summary.summary}</Section>

        {/* No symptoms or diagnosis section — the prescription shown, printed
            and downloaded here carries the medicines and advice only. Both are
            still generated and still on the record; they are simply not part
            of this document. */}

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-brand-700">Prescription</h3>
            {verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                <HiOutlineLockClosed className="h-3.5 w-3.5" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                Unverified
              </span>
            )}
          </div>
          {verified && (verifiedBy || verifiedAt) && (
            <p className="mt-1 text-xs text-slate-400">
              Signed off{verifiedBy ? ` by ${verifiedBy}` : ""}
              {verifiedAt ? ` on ${new Date(verifiedAt).toLocaleString()}` : ""} — locked.
            </p>
          )}

          {editing ? (
            <div className="mt-2">
              <PrescriptionEditor
                prescriptions={prescriptions}
                saving={savingRx}
                onCancel={() => setEditing(false)}
                onSave={handleSavePrescription}
              />
            </div>
          ) : prescriptions.length === 0 ? (
            <p className="mt-1.5 text-sm text-slate-400">No medicines suggested.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[38rem] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 font-medium">Dose</th>
                    <th className="px-4 py-2 font-medium">Frequency</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                    <th className="px-4 py-2 font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((p, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {p.medicine_name}
                        {!p.matched_formulary && (
                          <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                            not in formulary
                          </span>
                        )}
                        {/* Carried over from a case a doctor already signed
                            off, rather than proposed by the model on its own.
                            Worth distinguishing: the two carry very different
                            amounts of prior human judgement. */}
                        {p.from_precedent && (
                          <span
                            title="Carried over from a previous doctor-approved case with a similar presentation"
                            className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700"
                          >
                            doctor-approved before
                          </span>
                        )}
                        {/* What the patient is told to do — the line that
                            ends up on the label, so it belongs with the
                            medicine rather than in a column of its own. */}
                        {p.instructions && (
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {p.instructions}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{p.dose || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{p.frequency || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{p.duration || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{p.quantity || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Section title="Follow-up Advice">
          <ul className="list-disc space-y-1 pl-5">
            {summary.follow_up_advice.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title="Lifestyle Advice">
          <ul className="list-disc space-y-1 pl-5">
            {summary.lifestyle_advice.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>
      </div>

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}
      {successMsg && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
        >
          <HiOutlineCheckBadge className="h-5 w-5 shrink-0" />
          {successMsg}
        </p>
      )}
      {noticeMsg && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{noticeMsg}</p>
      )}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <p className="mb-3 text-xs text-slate-400">{hint}</p>

        <div className="flex flex-wrap items-center gap-3">
          {verified ? (
            <button
              onClick={handleUnlock}
              disabled={!canManage || busy}
              title={
                canManage ? "Withdraw the sign-off so the prescription can be edited again" : lockedReason
              }
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiOutlineLockOpen className="h-4.5 w-4.5" />
              {busyAction === "unlock" ? "Unlocking…" : "Unlock to Edit"}
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  clearMessages();
                  setConfirmingVerify(true);
                }}
                disabled={!canManage || busy || editing}
                title={canManage ? undefined : lockedReason}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <HiOutlineCheckBadge className="h-4.5 w-4.5" />
                {busyAction === "verify" ? "Verifying…" : "Verify Prescription"}
              </button>

              <button
                onClick={() => {
                  setEditing(true);
                  clearMessages();
                }}
                disabled={!canManage || busy || editing}
                title={canManage ? undefined : lockedReason}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <HiOutlinePencilSquare className="h-4.5 w-4.5" />
                Edit Prescription
              </button>
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {/* Both stay visible before verification so the workflow is
                discoverable — just inert, with the reason in the tooltip. */}
            <button
              onClick={handlePrint}
              disabled={!canPrint || busy}
              title={canPrint ? "Open the report to print" : printBlockedReason}
              className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <HiOutlinePrinter className="h-4.5 w-4.5" />
              {busyAction === "print" ? "Preparing…" : "Print"}
            </button>

            <button
              onClick={handleDownload}
              disabled={!canPrint || busy}
              title={canPrint ? "Download the report as a PDF" : printBlockedReason}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-200 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <HiOutlineArrowDownTray className="h-4.5 w-4.5" />
              {busyAction === "download" ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      {confirmingVerify && (
        <ConfirmDialog
          title="Verify Prescription"
          message={
            "Are you sure you have reviewed the prescription? After verification it is " +
            "finalized and ready for printing.\n\nYour approval also adds this case — the " +
            "symptoms, diagnosis and these exact medicines — to the hospital's knowledge " +
            "base, so future patients presenting the same way are suggested this same " +
            "treatment for a doctor to review. No patient details are stored with it, and " +
            "withdrawing the sign-off removes it again."
          }
          confirmLabel="Verify"
          cancelLabel="Cancel"
          busy={busyAction === "verify"}
          onCancel={() => setConfirmingVerify(false)}
          onConfirm={handleConfirmVerify}
        />
      )}
    </div>
  );
}
