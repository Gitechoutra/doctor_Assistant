import {
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUsers,
  HiOutlineDocumentChartBar,
  HiOutlineUserPlus,
  HiOutlineExclamationTriangle,
} from "react-icons/hi2";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import useLiveSummary from "../hooks/useLiveSummary";

const STATUS_STYLES = {
  scheduled: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
};

function StatusBadge({ status }) {
  const label = status.replace("_", " ");
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}
    >
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  // Counts refresh themselves on server pushes, tab focus and a slow poll,
  // which is why there is no refresh control here — it would only duplicate
  // something already happening. `refresh` stays on the hook and is still
  // wired to those triggers inside it.
  const { summary, loading, errorMsg } = useLiveSummary();

  return (
    <div>
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Welcome back, {user?.name}
        </h1>
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMsg}
        </p>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        summary &&
        // Reception gets the front desk's own numbers. The clinical cards are
        // deliberately absent rather than zeroed: the pages behind them 403
        // for this role, so a card linking to one would be a dead end.
        (summary.scope === "front_desk" ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Registered Patients"
              value={summary.total_patients}
              hint="Everyone on file"
              icon={HiOutlineUsers}
              to="/dashboard/patients"
            />
            <StatCard
              label="Registered Today"
              value={summary.todays_registrations}
              hint="New patients today"
              icon={HiOutlineUserPlus}
              to="/dashboard/patients"
            />
            <StatCard
              label="Today's Queue"
              value={summary.todays_appointments}
              hint="Waiting & in consultation"
              icon={HiOutlineCalendarDays}
              // No filter: the card counts the live queue, so it links to the
              // queue itself. A `?filter=today` here used to hide anyone
              // still waiting from an earlier day, leaving the card reading 0
              // over a page that listed them.
              to="/dashboard/appointments"
            />
            <StatCard
              label="Awaiting a Doctor"
              value={summary.unassigned_patients}
              hint={
                summary.unassigned_patients
                  ? "Route these to a doctor"
                  : "Everyone is routed"
              }
              icon={HiOutlineExclamationTriangle}
              to="/dashboard/patients"
            />
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Today's Appointments"
                value={summary.todays_appointments}
                hint="Waiting & in consultation"
                icon={HiOutlineCalendarDays}
                // Links to the whole queue, unfiltered — this is the count of
                // patients still to be seen, including anyone carried over
                // from an earlier day.
                to="/dashboard/appointments"
              />
              <StatCard
                label="Active Consultations"
                value={summary.active_consultations}
                hint="In progress"
                icon={HiOutlineChatBubbleLeftRight}
                // In-progress visits live in the queue (with a Resume button);
                // Consultations is the completed-only record.
                to="/dashboard/appointments?status=in_progress"
              />
              <StatCard
                label="Patients"
                value={summary.total_patients}
                hint="Total patients"
                icon={HiOutlineUsers}
                to="/dashboard/patients"
              />
              <StatCard
                label="Reports Generated"
                value={summary.reports_generated}
                hint={`${summary.todays_reports} today · ${summary.reports_generated} total`}
                icon={HiOutlineDocumentChartBar}
                to="/dashboard/reports"
              />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Recent Consultations
                </h2>
              </div>

              {summary.recent_consultations.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No consultations yet. They&apos;ll appear here once a
                  doctor starts one.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-3 font-medium">Patient</th>
                        <th className="pb-3 font-medium">Doctor</th>
                        <th className="pb-3 font-medium">Started</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recent_consultations.map((c) => (
                        <tr key={c.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-3 font-medium text-slate-800">{c.patient}</td>
                          <td className="py-3 text-slate-500">{c.doctor}</td>
                          <td className="py-3 text-slate-500">
                            {c.started_at
                              ? new Date(c.started_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-3">
                            <StatusBadge status={c.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ))
      )}
    </div>
  );
}
