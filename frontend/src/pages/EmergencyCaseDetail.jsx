import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineBeaker,
  HiOutlineCalendarDays,
  HiOutlineHeart,
  HiOutlineNoSymbol,
  HiOutlineTrash,
} from "react-icons/hi2";
import { Badge } from "../components/RecordCard";
import ConfirmDialog from "../components/ConfirmDialog";
import { SEVERITY_META, STATUS_META } from "../components/EmergencyCaseCard";
import AssignNurseModal from "../components/nursing/AssignNurseModal";
import SurgeryPanel from "../components/nursing/SurgeryPanel";
import OrderLabTestModal from "../components/lab/OrderLabTestModal";
import { useAuth } from "../context/AuthContext";
import useLiveRefresh from "../hooks/useLiveRefresh";
import {
  cancelEmergencyCase,
  fetchEmergencyCase,
  linkEmergencyAppointment,
  reopenEmergencyCase,
  resolveEmergencyCase,
  updateEmergencyCase,
} from "../services/emergencyService";
import { fetchAssignments } from "../services/nursingService";
import { deletePatient, fetchPatient } from "../services/patientService";
import { canManageEmergencyCase, canTreatEmergencyCase } from "../utils/permissions";

const DECISIONS = [
  { value: "", label: "Not decided yet" },
  { value: "ot_surgery", label: "OT / Surgery" },
  { value: "icu", label: "ICU" },
  { value: "observation", label: "Observation" },
  { value: "discharge", label: "Discharge" },
  { value: "other", label: "Other treatment" },
];

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

export default function EmergencyCaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [emergencyCase, setEmergencyCase] = useState(null);
  const [patient, setPatient] = useState(null);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [decision, setDecision] = useState("");

  const [assigningNurse, setAssigningNurse] = useState(false);
  const [orderingLab, setOrderingLab] = useState(false);
  const [linkingOp, setLinkingOp] = useState(false);
  const [linkAppointmentId, setLinkAppointmentId] = useState("");
  const [busyAction, setBusyAction] = useState(null); // "resolve" | "cancel" | "link" | "reopen"
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);

  const canTreat = canTreatEmergencyCase(user?.role);
  const canManage = canManageEmergencyCase(user?.role);
  // Mine to act on: claimed, still open, and — if I'm a doctor — claimed by
  // me specifically. Reception/admin never "own" a case, only doctors do.
  const isOwner =
    emergencyCase?.status === "in_progress" &&
    (user?.role !== "doctor" || emergencyCase?.doctor_id === user?.doctor_id);
  const canEdit = canTreat && isOwner;
  // A resolve made in error — same doctor, still resolved, can undo it.
  const canReopen =
    canTreat &&
    emergencyCase?.status === "resolved" &&
    emergencyCase?.doctor_id === user?.doctor_id;

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchEmergencyCase(id)
        .then((ec) => {
          setEmergencyCase(ec);
          setAssessmentNotes(ec.assessment_notes || "");
          setTreatmentNotes(ec.treatment_notes || "");
          setDecision(ec.decision || "");
          return Promise.all([
            fetchPatient(ec.patient_id).catch(() => null),
            fetchAssignments({ patient_id: ec.patient_id, status: "active" }).catch(() => []),
          ]);
        })
        .then(([patientData, assignments]) => {
          setPatient(patientData);
          setActiveAssignment(assignments?.[0] || null);
        })
        .catch(() => setErrorMsg("Could not load this emergency case."))
        .finally(() => setLoading(false));
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(() => load(true));

  async function handleSaveNotes(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const updated = await updateEmergencyCase(id, {
        assessment_notes: assessmentNotes,
        treatment_notes: treatmentNotes,
        decision: decision || null,
      });
      setEmergencyCase(updated);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve() {
    setBusyAction("resolve");
    setErrorMsg("");
    try {
      const updated = await resolveEmergencyCase(id, { decision: decision || undefined });
      setEmergencyCase(updated);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not resolve this case.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReopen() {
    setBusyAction("reopen");
    setErrorMsg("");
    try {
      const updated = await reopenEmergencyCase(id);
      setEmergencyCase(updated);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not reopen this case.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCancel() {
    setBusyAction("cancel");
    setErrorMsg("");
    try {
      const updated = await cancelEmergencyCase(id);
      setEmergencyCase(updated);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not cancel this case.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeletePatient() {
    if (!patient) return;
    setDeletingPatient(true);
    setErrorMsg("");
    try {
      await deletePatient(patient.id);
      // The patient is gone, and this emergency case went with them (the
      // server only allows the delete once it has nothing recorded on it) —
      // nothing left on this page to show.
      navigate("/dashboard/emergency");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not delete this patient.");
      setConfirmingDelete(false);
    } finally {
      setDeletingPatient(false);
    }
  }

  async function handleLinkAppointment(e) {
    e.preventDefault();
    if (!linkAppointmentId) return;
    setBusyAction("link");
    setErrorMsg("");
    try {
      const updated = await linkEmergencyAppointment(id, Number(linkAppointmentId));
      setEmergencyCase(updated);
      setLinkingOp(false);
      setLinkAppointmentId("");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not link that OP.");
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }
  if (!emergencyCase) {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
        {errorMsg || "Emergency case not found."}
      </p>
    );
  }

  const severity = SEVERITY_META[emergencyCase.severity] || SEVERITY_META.stable;
  const status = STATUS_META[emergencyCase.status] || { label: emergencyCase.status, tone: "slate" };
  const isOpen = emergencyCase.status === "in_progress" || emergencyCase.status === "waiting";
  // The ICU/observation nurse hand-off — the non-surgical door the nursing
  // gate now opens for an active case. OT/Surgery instead goes through the
  // SurgeryPanel below, unmodified.
  const canAssignNonSurgicalNurse =
    canEdit &&
    !activeAssignment &&
    (decision === "icu" || decision === "observation") &&
    !patient?.is_surgical;

  return (
    <div>
      <Link
        to="/dashboard/emergency"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
      >
        <HiOutlineArrowLeft className="h-4 w-4" />
        Back to Emergency Cases
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {emergencyCase.code} — {emergencyCase.patient_detail?.name || "Unknown patient"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{emergencyCase.reason}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={severity.tone}>{severity.label}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Patient</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact label="Code" value={emergencyCase.patient_detail?.code} />
              <Fact label="Age" value={emergencyCase.patient_detail?.age} />
              <Fact label="Gender" value={emergencyCase.patient_detail?.gender} />
              <Fact label="Phone" value={emergencyCase.patient_detail?.phone} />
            </div>
          </div>

          {/* Clinical assessment — reception neither records nor needs it,
              and every field is disabled for them anyway (canEdit requires
              canTreat, doctor-only), so the card was read-only dead weight
              on their screen. */}
          {user?.role !== "receptionist" && (
          <form onSubmit={handleSaveNotes} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Assessment &amp; treatment</h2>

            <div className="mt-3">
              <label className={labelClass}>Assessment notes</label>
              <textarea
                rows={3}
                className={inputClass}
                value={assessmentNotes}
                onChange={(e) => setAssessmentNotes(e.target.value)}
                disabled={!canEdit}
                placeholder="Findings on assessment"
              />
            </div>

            <div className="mt-3">
              <label className={labelClass}>Immediate treatment given</label>
              <textarea
                rows={3}
                className={inputClass}
                value={treatmentNotes}
                onChange={(e) => setTreatmentNotes(e.target.value)}
                disabled={!canEdit}
                placeholder="What was done before/without an OP"
              />
            </div>

            <div className="mt-3 max-w-xs">
              <label className={labelClass}>Decision</label>
              <select
                className={inputClass}
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                disabled={!canEdit}
              >
                {DECISIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="mt-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            {!canEdit && emergencyCase.status === "waiting" && (
              <p className="mt-3 text-xs text-slate-400">
                Nobody has claimed this case yet — claim it from the Emergency Cases board to
                assess and treat.
              </p>
            )}
            {!canEdit && emergencyCase.status === "in_progress" && (
              <p className="mt-3 text-xs text-slate-400">
                Claimed by Dr. {emergencyCase.doctor || "another doctor"} — only they can edit
                this case.
              </p>
            )}
          </form>
          )}

          {/* OT/Surgery decision reuses the exact same panel the normal
              surgical pathway uses — nothing here is emergency-specific. */}
          {patient && (patient.is_surgical || decision === "ot_surgery") && (
            <SurgeryPanel
              patient={patient}
              canManage={canEdit}
              hasActiveAssignment={Boolean(activeAssignment)}
              onAssignNurse={() => setAssigningNurse(true)}
              onPatientUpdated={(p) => {
                setPatient(p);
                if (!p.surgery_stage) setActiveAssignment(null);
              }}
            />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
            <div className="mt-3 flex flex-col gap-2">
              {canAssignNonSurgicalNurse && (
                <button
                  onClick={() => setAssigningNurse(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700"
                >
                  <HiOutlineHeart className="h-4 w-4" />
                  Assign nurse ({decision === "icu" ? "ICU" : "Observation"})
                </button>
              )}
              {activeAssignment && (
                <Link
                  to={`/dashboard/nursing/${activeAssignment.id}`}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <HiOutlineHeart className="h-4 w-4" />
                  Open nursing record
                </Link>
              )}
              {canTreat && isOwner && (
                <button
                  onClick={() => setOrderingLab(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <HiOutlineBeaker className="h-4 w-4" />
                  Request investigation
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => setLinkingOp((v) => !v)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <HiOutlineCalendarDays className="h-4 w-4" />
                  Link an OP
                </button>
              )}
              {linkingOp && (
                <form onSubmit={handleLinkAppointment} className="rounded-xl bg-slate-50 p-3">
                  <label className={labelClass}>OP / appointment ID</label>
                  <input
                    className={inputClass}
                    value={linkAppointmentId}
                    onChange={(e) => setLinkAppointmentId(e.target.value)}
                    placeholder="e.g. 42"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    A new OP raised for this patient links itself automatically — this is only
                    for one that existed before, or that was missed.
                  </p>
                  <button
                    type="submit"
                    disabled={busyAction === "link"}
                    className="mt-2 w-full rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {busyAction === "link" ? "Linking…" : "Link"}
                  </button>
                </form>
              )}
              {emergencyCase.linked_appointment_id && (
                <Link
                  to="/dashboard/appointments"
                  className="text-xs font-semibold text-brand-600 underline underline-offset-2"
                >
                  OP #{emergencyCase.linked_appointment_id} linked
                </Link>
              )}

              {canEdit && (
                <button
                  onClick={handleResolve}
                  disabled={busyAction === "resolve"}
                  className="mt-2 flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:shadow-md disabled:opacity-60"
                >
                  {busyAction === "resolve" ? "Resolving…" : "Resolve case"}
                </button>
              )}
              {canReopen && (
                <button
                  onClick={handleReopen}
                  disabled={busyAction === "reopen"}
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {busyAction === "reopen" ? "Reopening…" : "Reopen case"}
                </button>
              )}
              {isOpen && (canEdit || (canManage && emergencyCase.status === "waiting")) && (
                <button
                  onClick={handleCancel}
                  disabled={busyAction === "cancel"}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                >
                  <HiOutlineNoSymbol className="h-4 w-4" />
                  {busyAction === "cancel" ? "Cancelling…" : "Cancel case"}
                </button>
              )}
              {/* Removes the patient record itself, not just this case — the
                  server refuses it the moment there's anything clinical on
                  file (a consultation, a case, a nursing record, or this
                  case with notes/a decision recorded), so this is only ever
                  reachable for a mistaken or duplicate registration. */}
              {canManage && (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="mt-3 flex items-center gap-1.5 rounded-xl border-t border-slate-200 px-3 py-2 pt-4 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <HiOutlineTrash className="h-4 w-4" />
                  Delete patient record
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <TimelineRow label="Arrived" value={emergencyCase.arrived_at} />
              <TimelineRow label="Assessed" value={emergencyCase.assessed_at} />
              <TimelineRow label="Resolved" value={emergencyCase.resolved_at} />
            </dl>
            <p className="mt-3 text-[11px] text-slate-400">
              Registered by {emergencyCase.registered_by || "—"}
            </p>
          </div>
        </div>
      </div>

      {assigningNurse && patient && (
        <AssignNurseModal
          patientId={patient.id}
          patientName={patient.name}
          defaultPlan={treatmentNotes}
          defaultCareType={decision === "icu" ? "icu" : "observation"}
          isEmergency
          onClose={() => setAssigningNurse(false)}
          onAssigned={(assignment) => {
            setAssigningNurse(false);
            setActiveAssignment(assignment);
            navigate(`/dashboard/nursing/${assignment.id}`);
          }}
        />
      )}

      {orderingLab && patient && (
        <OrderLabTestModal
          patientId={patient.id}
          onClose={() => setOrderingLab(false)}
          onCreated={() => setOrderingLab(false)}
        />
      )}

      {confirmingDelete && patient && (
        <ConfirmDialog
          title="Delete patient"
          message={
            `Are you sure you want to delete this patient record?\n\n` +
            `${patient.name} (${patient.code}) will be removed permanently, along with ` +
            "this emergency case and any appointment they are queued for. This cannot be " +
            "undone. If they have a consultation, case, nursing or emergency record with " +
            "anything written on it, the server will refuse and nothing is deleted."
          }
          confirmLabel="Delete patient"
          cancelLabel="Cancel"
          destructive
          busy={deletingPatient}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleDeletePatient}
        />
      )}
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-700">{value ?? "—"}</p>
    </div>
  );
}

function TimelineRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">
        {value ? new Date(value).toLocaleString() : "—"}
      </dd>
    </div>
  );
}
