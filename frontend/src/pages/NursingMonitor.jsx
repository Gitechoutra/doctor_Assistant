import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineBellAlert,
  HiOutlineExclamationTriangle,
  HiOutlineHeart,
  HiOutlineInboxArrowDown,
} from "react-icons/hi2";
import SurgeryStageBadge from "../components/SurgeryStageBadge";
import {
  Badge,
  EmptyState,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordGrid,
  RecordGridSkeleton,
  cardLinkClass,
} from "../components/RecordCard";
import {
  CareTypeBadge,
  ComplianceBar,
  EmergencyBadge,
  formatWhen,
} from "../components/nursing/NursingBadges";
import useLiveNursing from "../hooks/useLiveNursing";
import { fetchAssignments, fetchNursingSummary } from "../services/nursingService";

function AssignmentCard({ assignment: a, remaining }) {
  return (
    <RecordCard accent={a.open_alerts > 0 ? "brand" : undefined}>
      <RecordCardBody>
        <RecordCardHeader
          name={a.patient}
          imageUrl={a.patient_photo_url}
          lines={[a.patient_code, `Nurse: ${a.nurse}`]}
        />

        <RecordCardBadges>
          {/* The doctor's monitor and the nurse's ward list render the same
              record, so they mark an emergency admission the same way. */}
          <EmergencyBadge emergency={a.emergency} />
          <CareTypeBadge careType={a.care_type} status={a.status} />
          <SurgeryStageBadge stage={a.surgery_stage} daysLeft={a.observation_days_left} />
          {a.open_alerts > 0 && (
            <Badge tone="amber" icon={HiOutlineBellAlert}>
              {a.open_alerts} alert{a.open_alerts > 1 ? "s" : ""}
            </Badge>
          )}
          {a.unreviewed_updates > 0 && <Badge tone="brand">{a.unreviewed_updates} new</Badge>}
        </RecordCardBadges>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="font-medium text-slate-700">{formatWhen(a.starts_at)}</span>
          <span>
            {a.status !== "active"
              ? a.status
              : remaining === null || remaining <= 0
                ? "Under care"
                : remaining === 1
                  ? "1 day planned"
                  : `${remaining} days planned`}
          </span>
        </div>

        <div className="mt-3">
          <ComplianceBar compliance={a.compliance} />
        </div>
      </RecordCardBody>

      <RecordCardFooter>
        <Link to={`/dashboard/nursing/${a.id}`} className={cardLinkClass}>
          Open record
        </Link>
      </RecordCardFooter>
    </RecordCard>
  );
}

const FILTERS = [
  { key: "active", label: "Under nursing care" },
  { key: "completed", label: "Discharged" },
  { key: "all", label: "All" },
];

function daysLeft(endsAt) {
  if (!endsAt) return null;
  return Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000);
}

/**
 * The doctor's remote view of every patient they've handed to a nurse:
 * medication compliance, outstanding alerts and how far into the observation
 * period each patient is — without opening a single record.
 */
export default function NursingMonitor() {
  const [status, setStatus] = useState("active");
  const [assignments, setAssignments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return Promise.all([fetchAssignments({ status }), fetchNursingSummary()])
        .then(([rows, stats]) => {
          setAssignments(rows);
          setSummary(stats);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load nursing records."))
        .finally(() => setLoading(false));
    },
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  // The whole point of this page is watching remotely, so it stays live.
  useLiveNursing(load);

  return (
    <div>
      {/* No manual refresh control — useLiveNursing keeps this page current
          on server pushes, tab focus and a slow poll. */}
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Nursing care</h1>
      </div>

      {summary && (summary.open_alerts > 0 || summary.missed_today > 0) && (
        <Link
          to="/dashboard/nursing/alerts"
          className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
        >
          <HiOutlineExclamationTriangle className="h-5 w-5" />
          {summary.open_alerts > 0 && (
            <span>
              {summary.open_alerts} alert{summary.open_alerts > 1 ? "s" : ""} waiting on you
              {summary.critical_alerts > 0 && ` (${summary.critical_alerts} urgent)`}
            </span>
          )}
          {summary.open_alerts > 0 && summary.missed_today > 0 && <span aria-hidden>·</span>}
          {summary.missed_today > 0 && (
            <span>
              {summary.missed_today} dose{summary.missed_today > 1 ? "s" : ""} missed today
            </span>
          )}
          <span className="ml-auto text-xs font-semibold underline">Review</span>
        </Link>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          to="/dashboard/nursing/updates"
          className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          <HiOutlineInboxArrowDown className="h-4 w-4" />
          Nursing updates
          {summary?.unreviewed_updates > 0 && (
            <span className="ml-1 rounded-full bg-white/25 px-1.5 text-[10px] font-bold">
              {summary.unreviewed_updates}
            </span>
          )}
        </Link>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === f.key
                ? "bg-brand-600 text-white shadow-md"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-6">
        {loading ? (
          <RecordGridSkeleton count={3} />
        ) : assignments.length === 0 ? (
          <EmptyState icon={HiOutlineHeart}>
            You haven&apos;t assigned a nurse to anyone yet. Finish a consultation and use{" "}
            <span className="font-semibold">Assign nurse</span> to hand the patient over for the
            observation period.
          </EmptyState>
        ) : (
          <RecordGrid>
            {assignments.map((a) => (
              <AssignmentCard key={a.id} assignment={a} remaining={daysLeft(a.ends_at)} />
            ))}
          </RecordGrid>
        )}
      </div>
    </div>
  );
}
