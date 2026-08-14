import { useEffect, useRef } from "react";
import { onNursingChanged } from "../services/socket";

// Backstop for a dropped socket. Shorter than the dashboard's poll: a doctor
// watching a recovering patient is the one case where stale is expensive.
const POLL_INTERVAL_MS = 30_000;

/**
 * Re-runs `onRefresh` whenever nursing activity lands, plus on tab focus and
 * a slow poll — the same three signals as `useLiveRefresh`, on the nursing
 * channel.
 *
 * Pass `assignmentId` on a detail page and only that patient's events wake it
 * up; leave it out on a list page to refresh on any of them. `onRefresh` is
 * called with `true` so callers can update in place instead of flashing a
 * loading skeleton.
 */
export default function useLiveNursing(onRefresh, { assignmentId = null } = {}) {
  const handlerRef = useRef(onRefresh);
  handlerRef.current = onRefresh;

  useEffect(() => {
    const refresh = () => handlerRef.current?.(true);

    const unsubscribe = onNursingChanged((payload) => {
      // A null id on the event means "something moved, but not about one
      // patient" — always worth a refresh.
      if (assignmentId && payload?.assignment_id && payload.assignment_id !== assignmentId) {
        return;
      }
      refresh();
    });

    const pollId = setInterval(refresh, POLL_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", refresh);

    return () => {
      unsubscribe();
      clearInterval(pollId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [assignmentId]);
}
