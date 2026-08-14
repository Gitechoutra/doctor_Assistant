import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  HiOutlineBeaker,
  HiOutlineBellAlert,
  HiOutlineClock,
  HiOutlineUsers,
} from "react-icons/hi2";
import Avatar from "../../components/Avatar";
import StatCard from "../../components/StatCard";
import SurgeryStageBadge from "../../components/SurgeryStageBadge";
import {
  CareTypeBadge,
  ComplianceBar,
  EmergencyBadge,
  formatWhen,
} from "../../components/nursing/NursingBadges";
import { useAuth } from "../../context/AuthContext";
import useLiveNursing from "../../hooks/useLiveNursing";
import { fetchNursingSummary } from "../../services/nursingService";

function daysLeft(endsAt) {
  if (!endsAt) return null;
  return Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000);
}

export function AssignmentCard({ assignment, to }) {
  const remaining = daysLeft(assignment.ends_at);
  const emergency = assignment.emergency;

  return (
    <Link
      to={to}
      className={`group block rounded-2xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        // An emergency admission is picked out of the ward list by the card
        // itself, not just a badge on it — a nurse scanning a full shift's
        // patients should not have to read each one to find them.
        emergency
          ? "border-2 border-red-200 hover:border-red-300"
          : "border border-slate-100 hover:border-teal-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={assignment.patient} imageUrl={assignment.patient_photo_url} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-800">{assignment.patient}</p>
            <p className="text-xs text-slate-400">{assignment.patient_code}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <EmergencyBadge emergency={emergency} />
          <CareTypeBadge careType={assignment.care_type} status={assignment.status} />
          <SurgeryStageBadge
            stage={assignment.surgery_stage}
            daysLeft={assignment.observation_days_left}
          />
        </div>
      </div>

      {emergency?.reason && (
        <p className="mt-2 line-clamp-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800">
          {emergency.reason}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>Dr: {assignment.doctor}</span>
        <span aria-hidden>·</span>
        <span>Nurse: {assignment.nurse}</span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {/* An elapsed window is not a status — the patient is under care
              until someone discharges them, so this only ever reports how
              long they have been, never that anything has lapsed. */}
          {remaining === null || remaining <= 0
            ? `Since ${formatWhen(assignment.starts_at)}`
            : remaining === 1
              ? "1 day planned"
              : `${remaining} days planned`}
        </span>
        {assignment.open_alerts > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
            <HiOutlineBellAlert className="h-3.5 w-3.5" />
            {assignment.open_alerts}
          </span>
        )}
      </div>

      <ComplianceBar compliance={assignment.compliance} className="mt-3" />
    </Link>
  );
}

export default function NurseDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return fetchNursingSummary()
      .then((data) => {
        setSummary(data);
        setErrorMsg("");
      })
      .catch(() => setErrorMsg("Could not load your patients."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A doctor assigning a patient mid-shift should appear without a reload.
  useLiveNursing(load);

  return (
    <div>
      {/* No manual refresh control — useLiveNursing keeps this page current
          on server pushes, tab focus and a slow poll. */}
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {user?.name ? `Hello, ${user.name}` : "Your shift"}
        </h1>
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        summary && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Patients in your care"
                value={summary.active_assignments}
                hint="Active assignments"
                icon={HiOutlineUsers}
                to="/nurse/patients"
              />
              <StatCard
                label="Doses due today"
                value={summary.doses_due_today}
                hint={`${summary.doses_logged_today} logged so far`}
                icon={HiOutlineClock}
                to="/nurse/patients"
              />
              <StatCard
                label="Missed today"
                value={summary.missed_today}
                hint="Each one alerts the doctor"
                icon={HiOutlineBeaker}
                to="/nurse/alerts"
              />
              <StatCard
                label="Open alerts"
                value={summary.open_alerts}
                hint={
                  summary.critical_alerts
                    ? `${summary.critical_alerts} urgent`
                    : "Awaiting a doctor"
                }
                icon={HiOutlineBellAlert}
                to="/nurse/alerts"
              />
            </div>

            <div className="mt-8 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Your patients</h2>
              {summary.active_assignments > summary.assignments.length && (
                <button
                  onClick={() => navigate("/nurse/patients")}
                  className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                >
                  View all {summary.active_assignments}
                </button>
              )}
            </div>

            {summary.assignments.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
                <p className="text-sm font-medium text-slate-600">
                  No patients assigned to you right now.
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  A doctor assigns you after a consultation, surgery or procedure —
                  the patient will appear here straight away.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {summary.assignments.map((a) => (
                  <AssignmentCard key={a.id} assignment={a} to={`/nurse/patients/${a.id}`} />
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
