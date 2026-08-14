import { STATUS_LABELS } from "../services/appointmentService";

/**
 * An appointment's status, coloured by what it means rather than decoratively.
 *
 * The five statuses map to three kinds of thing, and the colours say which:
 * amber is "somebody is waiting on you", brand is "happening now", slate is
 * "done with". Cancelled is deliberately not red — a patient rescheduling is
 * routine, not an error, and a board of red badges on a busy Monday would
 * make the one thing that really is wrong impossible to spot.
 */
const STYLES = {
  scheduled: "bg-slate-100 text-slate-600",
  waiting: "bg-amber-50 text-amber-700",
  in_progress: "bg-brand-50 text-brand-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-400 line-through",
};

export default function StatusBadge({ status, label, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        STYLES[status] || STYLES.scheduled
      } ${className}`}
    >
      {label || STATUS_LABELS[status] || status}
    </span>
  );
}
