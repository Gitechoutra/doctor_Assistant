import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineArrowPathRoundedSquare,
  HiOutlineBeaker,
  HiOutlineCheckBadge,
  HiOutlineClipboardDocumentCheck,
  HiOutlineExclamationTriangle,
} from "react-icons/hi2";
import StatCard from "../../components/StatCard";
import { EmptyState } from "../../components/RecordCard";
import {
  LabStatusBadge,
  PriorityBadge,
  RecollectionBadge,
  formatWhen,
} from "../../components/lab/LabBits";
import Avatar from "../../components/Avatar";
import { useAuth } from "../../context/AuthContext";
import useLiveRefresh from "../../hooks/useLiveRefresh";
import { fetchLabRequests, fetchLabSummary } from "../../services/labService";

/**
 * The lab technician's home screen: what is waiting, and what to pick up next.
 *
 * The counts and the list come from the same scoped endpoints the worklist
 * uses, so a technician can never see a number here that resolves to a test
 * they are not allowed to open.
 */
export default function LabDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return Promise.all([fetchLabSummary(), fetchLabRequests({ status: "open" })])
      .then(([stats, list]) => {
        setSummary(stats);
        setItems(list.items || []);
        setErrorMsg("");
      })
      .catch((err) =>
        setErrorMsg(err.response?.data?.message || "Could not load your worklist.")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A doctor ordering a test mid-shift should appear without a reload.
  useLiveRefresh(load);

  return (
    <div>
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {user?.name ? `Hello, ${user.name}` : "Laboratory"}
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
                label="Awaiting collection"
                value={summary.ordered}
                hint={
                  summary.awaiting_recollection
                    ? `${summary.awaiting_recollection} needing a fresh sample`
                    : "Samples still to take"
                }
                icon={HiOutlineClipboardDocumentCheck}
                to="/lab/requests?status=ordered"
              />
              <StatCard
                label="In processing"
                value={summary.processing}
                hint={`${summary.sample_collected} collected, not started`}
                icon={HiOutlineBeaker}
                to="/lab/requests?status=processing"
              />
              <StatCard
                label="Urgent open"
                value={summary.urgent_open}
                hint={summary.urgent_open ? "Do these first" : "Nothing urgent"}
                icon={HiOutlineExclamationTriangle}
                to="/lab/requests?status=open"
              />
              <StatCard
                label="Reports filed"
                value={summary.completed}
                hint={`${summary.verified} verified by the doctor`}
                icon={HiOutlineCheckBadge}
                to="/lab/requests?status=completed"
              />
            </div>

            {summary.unassigned > 0 && (
              <Link
                to="/lab/requests?status=open"
                className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                <HiOutlineArrowPathRoundedSquare className="h-5 w-5" />
                <span>
                  {summary.unassigned} test{summary.unassigned === 1 ? "" : "s"} not yet claimed
                  by anyone
                </span>
                <span className="ml-auto text-xs underline">Pick one up</span>
              </Link>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Your worklist</h2>
              <Link
                to="/lab/requests"
                className="text-sm font-semibold text-indigo-700 hover:text-indigo-800"
              >
                View all
              </Link>
            </div>

            {items.length === 0 ? (
              <div className="mt-4">
                <EmptyState icon={HiOutlineBeaker}>
                  Nothing open right now. A test appears here as soon as a doctor orders one
                  and assigns it to you.
                </EmptyState>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.slice(0, 9).map((r) => (
                  <Link
                    key={r.id}
                    to={`/lab/requests/${r.id}`}
                    className="group block rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={r.patient} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">{r.patient}</p>
                        <p className="truncate text-xs text-slate-400">{r.patient_code}</p>
                      </div>
                    </div>

                    <p className="mt-3 break-words text-sm font-medium text-slate-700">
                      {r.test_name}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <LabStatusBadge status={r.status} />
                      <PriorityBadge priority={r.priority} />
                      <RecollectionBadge request={r} />
                    </div>

                    <p className="mt-3 text-xs text-slate-400">
                      Ordered {formatWhen(r.created_at)}
                      {r.doctor && ` · ${r.doctor}`}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
