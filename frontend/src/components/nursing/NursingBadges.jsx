/**
 * The shared vocabulary of the nursing module. Both the nurse's screens and
 * the doctor's monitor render the same states, so the colours live in one
 * place — a "missed" dose must not be amber on one page and red on the other.
 */

const DOSE_STYLES = {
  completed: "bg-emerald-100 text-emerald-700",
  delayed: "bg-amber-100 text-amber-700",
  missed: "bg-red-100 text-red-700",
  skipped: "bg-slate-200 text-slate-600",
};

const SEVERITY_STYLES = {
  info: "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const ALERT_STATUS_STYLES = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

const CARE_TYPE_LABELS = {
  observation: "Observation",
  post_surgery: "Post-surgery",
  post_procedure: "Post-procedure",
  recovery: "Recovery",
  // The emergency hand-off's own care type. Missing here until now, so an
  // ICU patient's badge read a raw "icu" — the one care type where the label
  // mattering most is the one that had none.
  icu: "ICU",
};

// How bad the patient was on arrival, in the emergency module's own words
// (EmergencyCase.SEVERITIES). Red throughout rather than the alert palette's
// amber middle: a "serious" arrival is not a warning, it is an emergency.
const EMERGENCY_SEVERITY_LABELS = {
  critical: "Critical",
  serious: "Serious",
  stable: "Stable",
};

const EMERGENCY_SEVERITY_STYLES = {
  critical: "bg-red-600 text-white",
  serious: "bg-red-100 text-red-700",
  stable: "bg-amber-100 text-amber-700",
};

// What the claiming doctor decided the patient needed
// (EmergencyCase.DECISIONS).
const EMERGENCY_DECISION_LABELS = {
  ot_surgery: "OT / Surgery",
  icu: "ICU",
  observation: "Observation",
  discharge: "Discharge",
  other: "Other treatment",
};

const ASSIGNMENT_STATUS_STYLES = {
  active: "bg-brand-100 text-brand-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-200 text-slate-600",
};

const BASE = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold";

export function DoseBadge({ status }) {
  return (
    <span className={`${BASE} capitalize ${DOSE_STYLES[status] || DOSE_STYLES.skipped}`}>
      {status}
    </span>
  );
}

export function SeverityBadge({ severity, children }) {
  return (
    <span className={`${BASE} capitalize ${SEVERITY_STYLES[severity] || SEVERITY_STYLES.info}`}>
      {children || severity}
    </span>
  );
}

export function AlertStatusBadge({ status }) {
  return (
    <span className={`${BASE} capitalize ${ALERT_STATUS_STYLES[status] || ALERT_STATUS_STYLES.open}`}>
      {status}
    </span>
  );
}

export function CareTypeBadge({ careType, status }) {
  return (
    <span className={`${BASE} ${ASSIGNMENT_STATUS_STYLES[status] || ASSIGNMENT_STATUS_STYLES.active}`}>
      {CARE_TYPE_LABELS[careType] || careType}
    </span>
  );
}

/**
 * Marks a patient who came in through the emergency door, on every screen a
 * nurse might meet them on. Renders nothing for a routine admission, so it
 * can be dropped in beside the care-type badge unconditionally.
 */
export function EmergencyBadge({ emergency, className = "" }) {
  if (!emergency) return null;
  const severity = emergency.severity;
  return (
    <span
      className={`${BASE} gap-1 ${
        EMERGENCY_SEVERITY_STYLES[severity] || EMERGENCY_SEVERITY_STYLES.serious
      } ${className}`}
      title={emergency.reason || undefined}
    >
      <span aria-hidden>🚑</span>
      Emergency
      {severity ? ` · ${EMERGENCY_SEVERITY_LABELS[severity] || severity}` : ""}
    </span>
  );
}

/**
 * Medication compliance across the whole assignment. `rate` is null until the
 * first dose is logged — showing "0%" then would read as a failure when
 * nothing has been due yet.
 */
export function ComplianceBar({ compliance, className = "" }) {
  const rate = compliance?.rate;
  const missed = (compliance?.missed || 0) + (compliance?.skipped || 0);

  if (rate === null || rate === undefined) {
    return <p className={`text-xs text-slate-400 ${className}`}>No doses logged yet</p>;
  }

  const tone =
    rate >= 90 ? "bg-emerald-500" : rate >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{rate}% on course</span>
        <span className="text-slate-400">
          {compliance.total} logged{missed ? ` · ${missed} not given` : ""}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

export function formatWhen(iso, { withDate = true } = {}) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (!withDate) return time;
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? `Today ${time}` : `${date.toLocaleDateString()} ${time}`;
}

export {
  CARE_TYPE_LABELS,
  EMERGENCY_DECISION_LABELS,
  EMERGENCY_SEVERITY_LABELS,
};
