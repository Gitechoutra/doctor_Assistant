import { useCallback, useEffect, useState } from "react";
import { HiArrowLeft, HiOutlineExclamationTriangle } from "react-icons/hi2";
import Avatar from "../Avatar";
import ActivityTimeline from "./ActivityTimeline";
import AlertsPanel from "./AlertsPanel";
import CarePlanPanel from "./CarePlanPanel";
import DischargeModal from "./DischargeModal";
import MedicationPanel from "./MedicationPanel";
import MessageThread from "./MessageThread";
import NotesPanel from "./NotesPanel";
import ObservationsPanel from "./ObservationsPanel";
import SurgeryStageBadge from "../SurgeryStageBadge";
import {
  CareTypeBadge,
  ComplianceBar,
  EmergencyBadge,
  EMERGENCY_SEVERITY_LABELS,
  formatWhen,
} from "./NursingBadges";
import useLiveNursing from "../../hooks/useLiveNursing";
import { fetchAssignment } from "../../services/nursingService";

const TABS = [
  { key: "plan", label: "Care plan" },
  { key: "medications", label: "Medications" },
  { key: "observations", label: "Observations" },
  { key: "notes", label: "Notes & handover" },
  { key: "messages", label: "Messages" },
  { key: "alerts", label: "Alerts" },
  { key: "timeline", label: "Timeline" },
];

// Every kind of update the nurse sends the doctor, and which panel owns it.
const QUICK_ACTIONS = [
  { tab: "medications", label: "Medication / IV" },
  { tab: "observations", label: "Vitals & recovery" },
  { tab: "notes", label: "Note / handover" },
  { tab: "messages", label: "Message doctor" },
  { tab: "alerts", label: "Emergency", urgent: true },
];

function daysLeft(endsAt) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/**
 * One patient's complete nursing record, shared by the nurse's screen and the
 * doctor's monitor.
 *
 * There is deliberately no read-only variant: the server already says who may
 * do what via `can_record` and `can_manage_plan`, so both roles see the same
 * record and only the controls differ. A doctor reviewing during rounds is
 * looking at exactly what the nurse is looking at.
 */
export default function PatientRecord({ assignmentId, backTo, onBack, headerExtra }) {
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState("plan");
  const [discharging, setDischarging] = useState(false);
  // Bumped on every change so the timeline (which fetches separately) refetches.
  const [version, setVersion] = useState(0);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchAssignment(assignmentId)
        .then((data) => {
          setAssignment(data);
          setErrorMsg("");
        })
        .catch((err) =>
          setErrorMsg(err.response?.data?.message || "Could not load this patient's record.")
        )
        .finally(() => setLoading(false));
    },
    [assignmentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A doctor watching this page sees the nurse's entries as they land.
  useLiveNursing(load, { assignmentId: Number(assignmentId) });

  const handleChanged = useCallback(() => {
    setVersion((v) => v + 1);
    return load(true);
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (errorMsg || !assignment) {
    return (
      <div>
        {backTo && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            <HiArrowLeft className="h-4 w-4" />
            {backTo}
          </button>
        )}
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMsg || "Record not found."}
        </p>
      </div>
    );
  }

  const canRecord = Boolean(assignment.can_record);
  const canManagePlan = Boolean(assignment.can_manage_plan);
  const remaining = daysLeft(assignment.ends_at);
  const openAlerts = assignment.alerts.filter((a) => a.status === "open");

  return (
    <div>
      {backTo && (
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <HiArrowLeft className="h-4 w-4" />
          {backTo}
        </button>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar
              name={assignment.patient}
              imageUrl={assignment.patient_photo_url}
              size="lg"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{assignment.patient}</h1>
                {/* First badge, ahead of the care type: how the patient got
                    here changes how everything below it is read. */}
                <EmergencyBadge emergency={assignment.emergency} />
                <CareTypeBadge careType={assignment.care_type} status={assignment.status} />
                {/* Where the patient is on the surgical pathway — the nurse
                    needs to know whether they are watching someone waiting for
                    theatre, someone recovering, or someone whose observation
                    window is up. Renders nothing off the pathway. */}
                <SurgeryStageBadge
                  stage={assignment.surgery_stage}
                  daysLeft={assignment.observation_days_left}
                />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {assignment.patient_code}
                {assignment.patient_detail?.age != null
                  ? ` · ${assignment.patient_detail.age} yrs`
                  : ""}
                {assignment.patient_detail?.gender
                  ? ` · ${assignment.patient_detail.gender}`
                  : ""}
                {assignment.patient_detail?.blood_group
                  ? ` · ${assignment.patient_detail.blood_group}`
                  : ""}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                Nurse: {assignment.nurse} · Doctor: {assignment.doctor}
              </p>
            </div>
          </div>

          <div className="min-w-[14rem] space-y-2">
            <p className="text-xs text-slate-400">
              {formatWhen(assignment.starts_at)} → {formatWhen(assignment.ends_at)}
            </p>
            {assignment.status === "active" && (
              <p className="text-sm font-semibold text-slate-700">
                {remaining === null || remaining <= 0
                  ? "Under care"
                  : remaining === 1
                    ? "1 day planned"
                    : `${remaining} days planned`}
              </p>
            )}
            <ComplianceBar compliance={assignment.compliance} />

            {/* Either half of the pair can end care — the nurse is with the
                patient, the doctor signs off recovery. Nothing else closes an
                assignment, so without this a patient would stay on the list
                forever. */}
            {assignment.status === "active" && (canRecord || canManagePlan) && (
              <button
                onClick={() => setDischarging(true)}
                className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Mark completed & discharge
              </button>
            )}

            {headerExtra?.(assignment, handleChanged)}
          </div>
        </div>

        {/* The admission in one line, on every tab. The full account lives on
            the care plan, but a nurse logging a dose three tabs away still
            needs to know they are treating an emergency arrival. */}
        {assignment.emergency && (
          <button
            onClick={() => setTab("plan")}
            className="mt-4 flex w-full items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-left text-sm text-red-800 transition hover:bg-red-100"
          >
            <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">
                Emergency admission ({assignment.emergency.code}
                {assignment.emergency.severity
                  ? ` · ${
                      EMERGENCY_SEVERITY_LABELS[assignment.emergency.severity] ||
                      assignment.emergency.severity
                    }`
                  : ""}
                ):{" "}
              </span>
              {assignment.emergency.reason}
              <span className="block text-xs text-red-600">
                Arrived {formatWhen(assignment.emergency.arrived_at)} — open the care plan for
                the assessment and what was already given.
              </span>
            </span>
          </button>
        )}

        {assignment.patient_detail?.allergies && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Allergies: </span>
              {assignment.patient_detail.allergies}
            </span>
          </p>
        )}

        {/* One place for a nurse to start any update, so they don't have to
            know which tab a dose vs. a vital sign lives under. Each chip just
            opens the panel that already owns that record — no parallel path,
            so the doctor still receives one structured, auditable entry. */}
        {canRecord && assignment.status === "active" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Send update
            </span>
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.tab}
                onClick={() => setTab(a.tab)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  a.urgent
                    ? "bg-red-50 text-red-700 hover:bg-red-100"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {openAlerts.length > 0 && tab !== "alerts" && (
          <button
            onClick={() => setTab("alerts")}
            className="mt-4 flex w-full items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-left text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            <HiOutlineExclamationTriangle className="h-4 w-4 shrink-0" />
            {openAlerts.length} alert{openAlerts.length > 1 ? "s" : ""} awaiting the doctor —
            view
          </button>
        )}
      </div>

      {discharging && (
        <DischargeModal
          assignment={assignment}
          canCancel={canManagePlan}
          onClose={() => setDischarging(false)}
          onDone={() => {
            setDischarging(false);
            handleChanged();
          }}
        />
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-brand-600 text-white shadow-md"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
            {t.key === "alerts" && openAlerts.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {openAlerts.length}
              </span>
            )}
            {t.key === "messages" && assignment.unread_messages > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {assignment.unread_messages}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "plan" && <CarePlanPanel assignment={assignment} />}
        {tab === "medications" && (
          <MedicationPanel
            assignment={assignment}
            canRecord={canRecord}
            canManagePlan={canManagePlan}
            onChanged={handleChanged}
          />
        )}
        {tab === "observations" && (
          <ObservationsPanel
            assignment={assignment}
            canRecord={canRecord}
            onChanged={handleChanged}
          />
        )}
        {tab === "notes" && (
          <NotesPanel assignment={assignment} canRecord={canRecord} onChanged={handleChanged} />
        )}
        {tab === "messages" && (
          <MessageThread
            assignmentId={assignment.id}
            canMessage={Boolean(assignment.can_message)}
            // Whichever half of the pair the viewer isn't.
            counterpart={canRecord ? assignment.doctor : assignment.nurse}
          />
        )}
        {tab === "alerts" && (
          <AlertsPanel
            assignment={assignment}
            canRecord={canRecord}
            canAcknowledge={canManagePlan}
            onChanged={handleChanged}
          />
        )}
        {tab === "timeline" && (
          <ActivityTimeline assignmentId={assignment.id} refreshKey={version} />
        )}
      </div>
    </div>
  );
}
