import { useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineCheckBadge,
  HiOutlineChevronDown,
  HiOutlineClock,
} from "react-icons/hi2";

function formatDuration(seconds) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function Field({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function TextOrDash({ value }) {
  return value ? (
    <p className="whitespace-pre-line">{value}</p>
  ) : (
    <p className="text-slate-400">—</p>
  );
}

/**
 * One consultation session inside a case, on the case timeline.
 *
 * Everything shown here is that session's own stored record — it is never
 * rewritten when a later session happens or when the case is consolidated,
 * which is the whole point of the timeline: what was decided on each day
 * stays readable exactly as it was decided.
 */
export default function CaseSessionCard({ session, isLatest, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const summary = session.summary;
  const prescriptions = session.prescriptions || [];
  const inProgress = session.status !== "completed";
  const when = session.ended_at || session.started_at;

  return (
    <div className="relative pl-8">
      {/* Timeline rail: a line down the left with a node per session, so the
          order of treatment reads at a glance. */}
      <span
        aria-hidden
        className="absolute left-[11px] top-6 h-[calc(100%-0.5rem)] w-px bg-slate-200 last:hidden"
      />
      <span
        aria-hidden
        className={`absolute left-0 top-4 grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white ring-4 ring-white ${
          inProgress ? "animate-pulse bg-emerald-500" : "bg-brand-600"
        }`}
      >
        {session.session_number ?? "?"}
      </span>

      <div
        className={`rounded-2xl border bg-white shadow-sm ${
          inProgress ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-100"
        }`}
      >
        <div className="flex flex-wrap items-start gap-3 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">Session {session.session_number}</p>
              {inProgress ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  In progress
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  Completed
                </span>
              )}
              {isLatest && !inProgress && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  Most recent
                </span>
              )}
              {prescriptions.length > 0 && (
                <span
                  title={
                    session.prescription_verified
                      ? `Verified by ${session.prescription_verified_by || "the treating doctor"}`
                      : "This session's medicines were not signed off"
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    session.prescription_verified
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  <HiOutlineCheckBadge className="h-3.5 w-3.5" />
                  {session.prescription_verified ? "Rx verified" : "Rx unverified"}
                </span>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span>{when ? new Date(when).toLocaleString() : "—"}</span>
              {!inProgress && (
                <span className="inline-flex items-center gap-1">
                  <HiOutlineClock className="h-4 w-4 text-slate-400" />
                  {formatDuration(session.duration_seconds)}
                </span>
              )}
              <span>{prescriptions.length} medicine{prescriptions.length === 1 ? "" : "s"}</span>
            </div>

            <div className="mt-3">
              <Field title="Diagnosis">
                <TextOrDash value={summary?.possible_diagnosis} />
              </Field>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link
              to={`/dashboard/consultations/${session.id}`}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              {inProgress ? "Resume session" : "Open session"}
            </Link>
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
            >
              {expanded ? "Less" : "Details"}
              <HiOutlineChevronDown
                className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5">
            {!summary ? (
              <p className="text-sm text-slate-400">
                {inProgress
                  ? "This session is still being recorded — its summary is generated when it ends."
                  : "No AI summary was recorded for this session."}
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field title="Symptoms">
                  <TextOrDash value={summary.symptoms} />
                </Field>
                <Field title="Consultation notes">
                  <TextOrDash value={summary.summary} />
                </Field>
              </div>
            )}

            <div className="mt-5">
              <Field title={`Prescription issued at this session (${prescriptions.length})`}>
                {prescriptions.length === 0 ? (
                  <p className="text-slate-400">No medicines were prescribed.</p>
                ) : (
                  <div className="mt-1 overflow-x-auto rounded-xl border border-slate-100 bg-white">
                    <table className="w-full min-w-[32rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-4 py-2 font-medium">Medicine</th>
                          <th className="px-4 py-2 font-medium">Dose</th>
                          <th className="px-4 py-2 font-medium">Frequency</th>
                          <th className="px-4 py-2 font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prescriptions.map((p, i) => (
                          <tr key={i} className="border-b border-slate-50 last:border-0">
                            <td className="px-4 py-2 font-medium text-slate-800">
                              {p.medicine_name}
                            </td>
                            <td className="px-4 py-2 text-slate-500">{p.dose || "—"}</td>
                            <td className="px-4 py-2 text-slate-500">{p.frequency || "—"}</td>
                            <td className="px-4 py-2 text-slate-500">{p.duration || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Field>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
