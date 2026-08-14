import { useState } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckBadge,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
  HiOutlinePencilSquare,
  HiOutlinePrinter,
  HiOutlineSparkles,
} from "react-icons/hi2";
import ConfirmDialog from "./ConfirmDialog";
import PrescriptionEditor from "./PrescriptionEditor";
import {
  saveFinalPrescriptions,
  unverifyFinalPrescription,
  verifyFinalPrescription,
} from "../services/caseService";
import { downloadReport, generateCaseReport, openReportForPrint } from "../services/reportService";

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-brand-700">{title}</h3>
      <div className="mt-1.5 text-sm text-slate-600">{children}</div>
    </div>
  );
}

function AdviceList({ items }) {
  if (!items?.length) return <p className="text-slate-400">—</p>;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * The consolidated record of a closed case: the whole course of treatment
 * summarised, and one final prescription merged from every session.
 *
 * Deliberately a sibling of SummaryPanel rather than a variant of it. A
 * session's panel documents one conversation and is signed off on the day;
 * this one documents the treatment as a whole and carries its own separate
 * signature, and the two must never share a lock — unlocking the final list
 * to edit it cannot be allowed to reopen a session prescription that was
 * already signed and dispensed.
 */
export default function CaseSummaryPanel({
  caseRecord,
  canManage = true,
  onCaseUpdated,
}) {
  const [busyAction, setBusyAction] = useState(null); // "print" | "download" | "verify" | "unlock"
  const [savingRx, setSavingRx] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingVerify, setConfirmingVerify] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [noticeMsg, setNoticeMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const consolidation = caseRecord.consolidation || {};
  const prescriptions = caseRecord.final_prescriptions || [];
  const verified = caseRecord.final_verified;

  const filename = `${(caseRecord.patient || "patient").replace(/\s+/g, "_")}_full_medical_report.pdf`;

  function clearMessages() {
    setErrorMsg("");
    setNoticeMsg("");
    setSuccessMsg("");
  }

  function fail(err, fallback) {
    setErrorMsg(err.response?.data?.message || fallback);
  }

  // Regenerated on each use so the PDF always reflects the current final
  // prescription and signature, never an older snapshot.
  async function withReport(action, run) {
    setBusyAction(action);
    clearMessages();
    try {
      const report = await generateCaseReport(caseRecord.id);
      await run(report);
    } catch (err) {
      fail(err, "Could not produce the consolidated report.");
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
      onCaseUpdated?.(await request(caseRecord.id));
      setSuccessMsg(doneMessage);
    } catch (err) {
      fail(err, "Could not update the verification.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmVerify() {
    setConfirmingVerify(false);
    await runVerification(
      "verify",
      verifyFinalPrescription,
      "Final prescription verified. The consolidated report can now be printed."
    );
  }

  const handleUnlock = () =>
    runVerification(
      "unlock",
      unverifyFinalPrescription,
      "Final prescription unlocked. Verify it again to enable printing."
    );

  async function handleSavePrescription(rows) {
    setSavingRx(true);
    clearMessages();
    try {
      onCaseUpdated?.(await saveFinalPrescriptions(caseRecord.id, rows));
      setEditing(false);
      setSuccessMsg("Final prescription saved. Verify it to enable printing.");
    } catch (err) {
      fail(err, "Could not save the final prescription.");
    } finally {
      setSavingRx(false);
    }
  }

  const busy = busyAction !== null || savingRx;
  const canPrint = verified && !editing;
  const lockedReason = "Only the treating doctor can change this prescription";
  const printBlockedReason = verified
    ? "Finish editing first"
    : "Verify the final prescription to enable printing";

  const hint = verified
    ? "The final prescription is verified and locked. Unlock it to make further changes."
    : canManage
      ? "Review the merged medicines, then verify to sign them off — printing the consolidated report unlocks after that."
      : lockedReason;

  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm ring-1 ring-brand-50">
      <div className="mb-5 flex items-center gap-2">
        <HiOutlineSparkles className="h-5 w-5 text-brand-600" />
        <h2 className="text-base font-semibold text-slate-900">Consolidated Record</h2>
      </div>

      <div className="space-y-5">
        <Section title="Overall Summary">
          {consolidation.final_summary || <span className="text-slate-400">—</span>}
        </Section>

        {consolidation.progression && (
          <Section title="Progression Across Sessions">{consolidation.progression}</Section>
        )}

        <Section title="Final Assessment (Assistive)">
          <p>{consolidation.final_diagnosis || "—"}</p>
          <p className="mt-1 text-xs italic text-slate-400">
            Assistive only — not a confirmed diagnosis. The treating doctor must verify.
          </p>
        </Section>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-brand-700">Final Consolidated Prescription</h3>
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
          <p className="mt-1 text-xs text-slate-400">
            Supersedes the individual session prescriptions. Where a medicine was prescribed
            more than once, the most recent instructions apply.
          </p>
          {verified && (caseRecord.final_verified_by || caseRecord.final_verified_at) && (
            <p className="mt-1 text-xs text-slate-400">
              Signed off{caseRecord.final_verified_by ? ` by ${caseRecord.final_verified_by}` : ""}
              {caseRecord.final_verified_at
                ? ` on ${new Date(caseRecord.final_verified_at).toLocaleString()}`
                : ""}{" "}
              — locked.
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
            <p className="mt-1.5 text-sm text-slate-400">
              No ongoing medication at the end of this course of treatment.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[38rem] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 font-medium">Dose</th>
                    <th className="px-4 py-2 font-medium">Frequency</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                    <th className="px-4 py-2 font-medium">From</th>
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
                      </td>
                      <td className="px-4 py-2 text-slate-600">{p.dose || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{p.frequency || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{p.duration || "—"}</td>
                      {/* Where in the course this medicine's current
                          instruction came from — the part of the merge a
                          plain list can't show. */}
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {p.note ||
                          (p.source_session_number
                            ? `Session ${p.source_session_number}`
                            : "Added by doctor")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Section title="Follow-up Instructions">
          <AdviceList items={consolidation.follow_up_advice} />
        </Section>

        <Section title="Lifestyle Advice">
          <AdviceList items={consolidation.lifestyle_advice} />
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
              title={canManage ? "Withdraw the sign-off so the final list can be edited" : lockedReason}
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
                {busyAction === "verify" ? "Verifying…" : "Verify Final Prescription"}
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
                Edit Final Prescription
              </button>
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <button
              onClick={handlePrint}
              disabled={!canPrint || busy}
              title={canPrint ? "Open the consolidated report to print" : printBlockedReason}
              className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <HiOutlinePrinter className="h-4.5 w-4.5" />
              {busyAction === "print" ? "Preparing…" : "Print Full Report"}
            </button>

            <button
              onClick={handleDownload}
              disabled={!canPrint || busy}
              title={canPrint ? "Download the consolidated report as a PDF" : printBlockedReason}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-200 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <HiOutlineArrowDownTray className="h-4.5 w-4.5" />
              {busyAction === "download" ? "Preparing…" : "Download Full Report"}
            </button>
          </div>
        </div>
      </div>

      {confirmingVerify && (
        <ConfirmDialog
          title="Verify Final Prescription"
          message={
            "This signs off the consolidated medication list for the whole course of treatment, " +
            "which supersedes the individual session prescriptions. Have you reviewed it?"
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
