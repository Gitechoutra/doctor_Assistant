import { Link } from "react-router-dom";
import {
  HiOutlineArrowRightCircle,
  HiOutlineClock,
  HiOutlineUserGroup,
} from "react-icons/hi2";
import Avatar from "./Avatar";

/**
 * The day's queue, as both roles see it.
 *
 * Positions are **numbers**, not dots. The PA reads a position out loud at the
 * desk — "you're third" — and the patient counts it down; a decorative dot
 * cannot be read out, and a queue you cannot say out loud is not a queue, it
 * is a list. The numbers come from the server (`queue_number`, 0 for whoever
 * is with the doctor) so the desk and the consulting room can never be showing
 * different ones.
 *
 * The layout follows the same sentence:
 *
 *     NOW CONSULTING   Anita Rao
 *     NEXT
 *       1. Vikram Shah
 *       2. Priya Menon
 */

function waitedFor(appointment) {
  const since = appointment.arrived_at || appointment.created_at;
  if (!since) return null;
  const minutes = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (minutes < 1) return "just arrived";
  if (minutes < 60) return `waiting ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `waiting ${hours}h ${minutes % 60}m`;
}

function PatientLine({ appointment, children, highlight = false }) {
  const patient = appointment.patient_detail;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-4 transition ${
        highlight
          ? "border-brand-200 bg-brand-50/60"
          : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
      }`}
    >
      {/* The position, given the weight of a number and not a bullet. */}
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold tabular-nums ${
          highlight ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
        }`}
        aria-hidden
      >
        {highlight ? "•" : appointment.queue_number}
      </div>

      <Avatar name={appointment.patient} imageUrl={patient?.photo_url} size="md" />

      <div className="min-w-0 flex-1">
        <Link
          to={`/dashboard/patients/${appointment.patient_id}`}
          className="block truncate font-semibold text-slate-800 hover:text-brand-700"
          title={appointment.patient}
        >
          {appointment.patient}
        </Link>
        <p className="truncate text-xs text-slate-400">
          {[
            patient?.code,
            patient?.age != null ? `${patient.age} yrs` : null,
            patient?.gender,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {appointment.reason && (
          <p className="mt-1 truncate text-xs text-slate-500" title={appointment.reason}>
            {appointment.reason}
          </p>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 text-xs text-slate-400 sm:flex">
        <HiOutlineClock className="h-4 w-4" />
        {waitedFor(appointment)}
      </div>

      {children}
    </div>
  );
}

export default function QueueBoard({
  queue = [],
  /** The doctor's "call them in". Omitted for the PA, who watches rather than
   *  acts here — the API refuses them anyway. */
  onStart,
  startingId = null,
  emptyMessage = "Nobody is waiting. The queue fills as the PA checks patients in.",
}) {
  const consulting = queue.filter((a) => a.status === "in_progress");
  const waiting = queue.filter((a) => a.status !== "in_progress");

  if (!queue.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <HiOutlineUserGroup className="mx-auto h-9 w-9 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">The queue is empty</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {consulting.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand-600">
            Now consulting
          </h3>
          <div className="space-y-2">
            {consulting.map((appointment) => (
              <PatientLine key={appointment.id} appointment={appointment} highlight>
                {onStart && (
                  <Link
                    to={`/dashboard/consultations/${appointment.consultation_id}`}
                    className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
                  >
                    Resume
                  </Link>
                )}
              </PatientLine>
            ))}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Next
          </h3>
          <div className="space-y-2">
            {waiting.map((appointment) => (
              <PatientLine key={appointment.id} appointment={appointment}>
                {onStart && (
                  <button
                    onClick={() => onStart(appointment)}
                    disabled={startingId === appointment.id}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <HiOutlineArrowRightCircle className="h-4 w-4" />
                    {startingId === appointment.id ? "Starting…" : "Start"}
                  </button>
                )}
              </PatientLine>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
