import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDashboardSummary } from "../services/dashboardService";
import useLiveRefresh from "./useLiveRefresh";

/**
 * The dashboard counts, kept current by useLiveRefresh.
 */
export default function useLiveSummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Guards against a slow response from an earlier refresh overwriting a
  // newer one, and against setState after the component unmounts.
  const activeRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const data = await fetchDashboardSummary();
      if (!activeRef.current || requestId !== requestIdRef.current) return;
      setSummary(data);
      setErrorMsg("");
    } catch {
      if (!activeRef.current || requestId !== requestIdRef.current) return;
      // Keep the last good numbers on screen rather than blanking the cards.
      setErrorMsg("Could not refresh dashboard data.");
    } finally {
      if (activeRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useLiveRefresh(refresh);

  return { summary, loading, errorMsg, refresh };
}
