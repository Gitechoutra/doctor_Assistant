import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineBeaker,
  HiOutlineBellAlert,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlineHeart,
  HiOutlinePencilSquare,
  HiOutlineArrowsRightLeft,
} from "react-icons/hi2";
import { formatWhen } from "./NursingBadges";
import { fetchTimeline } from "../../services/nursingService";

const EVENT_ICONS = {
  assignment: HiOutlineClipboardDocumentCheck,
  medication: HiOutlineBeaker,
  observation: HiOutlineHeart,
  note: HiOutlinePencilSquare,
  handover: HiOutlineArrowsRightLeft,
  alert: HiOutlineBellAlert,
  acknowledgement: HiOutlineCheckCircle,
};

const SEVERITY_DOT = {
  info: "bg-slate-200 text-slate-500",
  success: "bg-emerald-100 text-emerald-600",
  warning: "bg-amber-100 text-amber-600",
  critical: "bg-red-100 text-red-600",
};

/**
 * The complete audit trail: every dose, observation, note and alert in one
 * sequence. Fetched separately from the record because it's assembled
 * server-side across four tables and is the one view a doctor may open
 * without needing the editing panels at all.
 */
export default function ActivityTimeline({ assignmentId, refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(() => {
    return fetchTimeline(assignmentId)
      .then((rows) => {
        setEvents(rows);
        setErrorMsg("");
      })
      .catch(() => setErrorMsg("Could not load the activity timeline."))
      .finally(() => setLoading(false));
  }, [assignmentId]);

  // refreshKey bumps whenever the parent record changes, so logging a dose
  // updates the timeline without a second live subscription.
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Activity timeline</h2>

      {errorMsg ? (
        <p className="py-10 text-center text-sm text-red-600">{errorMsg}</p>
      ) : events.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-5 space-y-1">
          {events.map((event, index) => {
            const Icon = EVENT_ICONS[event.type] || HiOutlinePencilSquare;
            const isLast = index === events.length - 1;
            return (
              <li key={`${event.type}-${event.ref_id ?? index}-${event.at}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                      SEVERITY_DOT[event.severity] || SEVERITY_DOT.info
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {!isLast && <span className="my-1 w-px flex-1 bg-slate-100" />}
                </div>

                <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-4"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-slate-800">
                      {event.title}
                    </p>
                    <p className="text-xs text-slate-400">{formatWhen(event.at)}</p>
                  </div>
                  {event.detail && (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                      {event.detail}
                    </p>
                  )}
                  {event.actor && (
                    <p className="mt-0.5 text-xs text-slate-400">{event.actor}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
