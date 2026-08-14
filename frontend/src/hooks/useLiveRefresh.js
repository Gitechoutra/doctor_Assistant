import { useEffect, useRef } from "react";
import { onDashboardChanged } from "../services/socket";

// Backstop only — the socket ping is what normally triggers a refresh. Long
// enough that an idle page isn't hammering the API.
const POLL_INTERVAL_MS = 60_000;

/**
 * Re-runs `onRefresh` whenever the data behind a page may have changed, from
 * three independent signals so no single failure leaves stale numbers:
 *
 *   1. a server push when a consultation, appointment, patient or report moves
 *   2. returning to the tab (you were somewhere else while it changed)
 *   3. a slow poll, in case the socket dropped without us noticing
 *
 * `onRefresh` is called with `true` for these background refreshes, so a
 * caller can skip its loading skeleton and update in place instead of
 * flashing the whole list.
 */
export default function useLiveRefresh(onRefresh, { poll = true } = {}) {
  // Kept in a ref so a caller passing an inline function doesn't tear down
  // and re-arm every listener on each render.
  const handlerRef = useRef(onRefresh);
  handlerRef.current = onRefresh;

  useEffect(() => {
    const refresh = () => handlerRef.current?.(true);

    const unsubscribe = onDashboardChanged(refresh);
    const pollId = poll ? setInterval(refresh, POLL_INTERVAL_MS) : null;

    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", refresh);

    return () => {
      unsubscribe();
      if (pollId) clearInterval(pollId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [poll]);
}
