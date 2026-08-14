import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import EmergencyCaseCard from "../../components/EmergencyCaseCard";
import { RecordGrid } from "../../components/RecordCard";
import {
  AlertStatusBadge,
  SeverityBadge,
  formatWhen,
} from "../../components/nursing/NursingBadges";
import { useAuth } from "../../context/AuthContext";
import useEmergencyClaim from "../../hooks/useEmergencyClaim";
import useLiveNursing from "../../hooks/useLiveNursing";
import { fetchEmergencyCases } from "../../services/emergencyService";
import { fetchAlerts } from "../../services/nursingService";
import { fetchNotifications, markNotificationRead } from "../../services/notificationService";
import { onDashboardChanged } from "../../services/socket";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

/**
 * Every escalation the caller can see, across all their patients.
 *
 * Shared by both modules — a nurse sees what they raised and whether the
 * doctor has answered; a doctor sees what is waiting on them. `basePath` is
 * the only difference, because the two link into different record routes.
 */
export default function NurseAlerts({ basePath = "/nurse/patients", title = "Alerts" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("open");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // A patient registered or routed to a doctor isn't a nursing escalation —
  // it has no assignment to hang a ClinicalAlert off — so it's kept as its
  // own list, sourced from the notification it already sends, rather than
  // forced into the alert model above. Doctor-only: nobody else is ever the
  // target of "a patient was assigned to you".
  const isDoctor = user?.role === "doctor";
  const [patientNotifications, setPatientNotifications] = useState([]);

  // An unclaimed emergency is the most urgent thing this page can show, and
  // it used to be the one thing a doctor could not act on from here: the
  // notification said an emergency had been logged, and claiming it meant
  // finding the bell, opening the row and walking over to the board. The
  // board's own card is reused verbatim so Claim behaves identically in both
  // places. Doctor-only, like the claim endpoint itself — a nurse reading
  // this same page has nothing to claim.
  const [emergencyCases, setEmergencyCases] = useState([]);

  const loadEmergencyCases = useCallback(() => {
    if (!isDoctor) return undefined;
    // The board endpoint already narrows itself per doctor to "unclaimed,
    // plus whatever I hold"; the unclaimed half is the actionable part, and
    // a case claimed by anyone drops out of this list on the next refresh.
    return fetchEmergencyCases()
      .then((rows) => setEmergencyCases(rows.filter((c) => c.status === "waiting")))
      .catch(() => {});
  }, [isDoctor]);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchAlerts(status)
        .then((rows) => {
          setAlerts(rows);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load alerts."))
        .finally(() => setLoading(false));
    },
    [status]
  );

  const loadPatientNotifications = useCallback(() => {
    if (!isDoctor) return undefined;
    // Not filtered to unread: a doctor scanning this list is checking who
    // was recently added, not clearing a to-do list -- a patient assigned
    // yesterday should still be here today, just below whoever is newest.
    // The server already orders newest-first, so a fresh arrival appears at
    // the top without this doing any sorting of its own.
    return fetchNotifications({ category: "patient_assignment", limit: 20 })
      .then(({ items }) => setPatientNotifications(items))
      .catch(() => {});
  }, [isDoctor]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadPatientNotifications();
    loadEmergencyCases();
  }, [loadPatientNotifications, loadEmergencyCases]);

  // Patient assignment and emergency cases ping the dashboard channel
  // (create_patient, reassign_patient, emergency_case_created/claimed), not
  // the nursing one below -- neither is nursing activity, so they would never
  // otherwise refresh these lists live. It is also what retires a Claim
  // button here the moment another doctor takes the case.
  useEffect(() => {
    if (!isDoctor) return undefined;
    return onDashboardChanged(() => {
      loadPatientNotifications();
      loadEmergencyCases();
    });
  }, [isDoctor, loadPatientNotifications, loadEmergencyCases]);

  useLiveNursing(load);

  const {
    claim,
    claimingId,
    error: claimError,
  } = useEmergencyClaim({ onSettled: () => loadEmergencyCases() });

  // Opening one reads it, same as the bell menu — but it stays in this list
  // either way. Only the "new" dot goes away; a doctor scrolling back
  // through who was recently assigned needs the row still there.
  function handleOpenPatientNotification(id) {
    setPatientNotifications((rows) =>
      rows.map((r) => (r.id === id ? { ...r, is_read: true } : r))
    );
    markNotificationRead(id).catch(() => {});
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                status === f.key
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isDoctor && emergencyCases.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
            <HiOutlineExclamationTriangle className="h-4 w-4" />
            Emergency cases waiting to be claimed
          </h2>
          {claimError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {claimError.message}
            </p>
          )}
          <RecordGrid>
            {emergencyCases.map((c) => (
              <EmergencyCaseCard
                key={c.id}
                emergencyCase={c}
                canClaim
                busy={claimingId === c.id}
                onClaim={(ec) => claim(ec.id)}
                onOpen={(ec) => navigate(`/dashboard/emergency/${ec.id}`)}
              />
            ))}
          </RecordGrid>
        </div>
      )}

      {isDoctor && patientNotifications.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <HiOutlineUserPlus className="h-4 w-4" />
            New patients assigned to you
          </h2>
          {patientNotifications.map((n) => (
            <Link
              key={n.id}
              to={n.link || "/dashboard/patients"}
              onClick={() => handleOpenPatientNotification(n.id)}
              className={`flex items-start gap-3 rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${
                n.is_read ? "border-slate-100 bg-white" : "border-brand-200 bg-brand-50/60"
              }`}
            >
              {!n.is_read && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" title="New" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                <p className="text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-xs text-slate-400">{formatWhen(n.created_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        // Silent when the emergency or patient-assignment lists above already
        // have something on screen — "nothing needs attention" would
        // contradict them — but still a proper empty state the rest of the
        // time.
        !(isDoctor && (emergencyCases.length > 0 || patientNotifications.length > 0)) && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
            <HiOutlineCheckCircle className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="mt-2 text-sm font-medium text-slate-600">
              {status === "open" ? "Nothing needs attention." : "No alerts in this view."}
            </p>
          </div>
        )
      ) : (
        <div className="mt-6 space-y-3">
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              to={`${basePath}/${alert.assignment_id}`}
              className={`block rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${
                alert.status === "open" && alert.severity === "critical"
                  ? "border-red-300 bg-red-50/60"
                  : alert.status === "open"
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-slate-100 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={alert.severity}>{alert.category_label}</SeverityBadge>
                  <AlertStatusBadge status={alert.status} />
                  <span className="text-sm font-semibold text-slate-800">
                    {alert.patient}
                    {alert.patient_code && (
                      <span className="ml-1.5 font-normal text-slate-400">
                        {alert.patient_code}
                      </span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {alert.nurse} · {formatWhen(alert.created_at)}
                </p>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-slate-700">{alert.message}</p>

              {alert.doctor_response && (
                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                  <span className="font-semibold text-emerald-700">Doctor&apos;s reply: </span>
                  {alert.doctor_response}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
