import { HiOutlineArrowRightCircle, HiOutlineClock, HiOutlinePlay } from "react-icons/hi2";
import {
  Badge,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordDetail,
  cardLinkClass,
} from "./RecordCard";

const STATUS_META = {
  in_progress: { label: "In consultation", tone: "emeraldSolid" },
  waiting: { label: "Pending consultation", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "amber" },
  completed: { label: "Completed", tone: "slate" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

// The patient is still to be seen, so the doctor can call them in. "waiting"
// is what the queue actually stores; the other two are accepted so a booked
// slot labelled scheduled or confirmed offers the button just the same.
const STARTABLE_STATUSES = ["waiting", "scheduled", "confirmed"];

/**
 * One patient in the department queue.
 *
 * `isNext` highlights the top waiting card — the person the doctor should
 * call in once the current consultation ends.
 *
 * `canConsult` is whether this viewer may call patients in at all. False for
 * a receptionist and for an admin, who both read this queue for their own
 * reasons without ever running the visit. They still see the card, its
 * status and its position — the card is the queue, not the action.
 *
 * `onViewDetails` is optional and adds the way through to the patient's own
 * page. Omitted on screens that are already about one patient, so the button
 * never links to where you are.
 */
export default function AppointmentCard({
  appointment,
  isNext,
  canConsult = false,
  onStart,
  onResume,
  onViewDetails,
  busy,
}) {
  const patient = appointment.patient_detail || {};
  const ongoing = appointment.status === "in_progress";
  // Only an appointment still to be seen gets the button — a completed or
  // cancelled one has nothing left to start.
  const canStart = canConsult && STARTABLE_STATUSES.includes(appointment.status);
  const status = STATUS_META[appointment.status] || {
    label: appointment.status.replace("_", " "),
    tone: "slate",
  };

  const appointmentTime = appointment.created_at
    ? new Date(appointment.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <RecordCard accent={ongoing ? "emerald" : isNext ? "brand" : undefined}>
      <RecordCardBody>
        <RecordCardHeader
          name={patient.name || appointment.patient}
          imageUrl={patient.photo_url}
          lines={[patient.code || `PAT${appointment.patient_id}`]}
          badge={
            appointment.queue_number != null && (
              <span
                title={`Queue position ${appointment.queue_number}`}
                className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white ring-2 ring-white"
              >
                {appointment.queue_number}
              </span>
            )
          }
        />

        <RecordCardBadges>
          <Badge tone={status.tone}>{status.label}</Badge>
          {isNext && <Badge tone="brand">Next up</Badge>}
        </RecordCardBadges>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
          <RecordDetail label="Age" value={patient.age != null ? `${patient.age} yrs` : null} />
          <RecordDetail label="Gender" value={patient.gender} />
          <RecordDetail label="Appointment" value={appointmentTime} />
          <RecordDetail
            label="Queue"
            value={appointment.queue_number != null ? `#${appointment.queue_number}` : "In room"}
          />
        </div>

        {appointment.reason && (
          <p className="mt-3 text-sm text-slate-500">
            <span className="font-medium text-slate-600">Reason:</span> {appointment.reason}
          </p>
        )}
      </RecordCardBody>

      {/* The footer always carries two things — a state on the left, the
          time on the right — so a card without the action button keeps the
          same shape rather than leaving a hole where it was. For a viewer
          who cannot consult, the left slot is the status label, which is the
          same fallback an already-completed appointment has always used.
          "View details" sits alongside whichever of those is showing, which
          is why the left slot is a row rather than a single child. */}
      <RecordCardFooter>
        <div className="flex flex-wrap items-center gap-2">
          {ongoing && canConsult ? (
            <button
              onClick={() => onResume(appointment)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:shadow-md"
            >
              <HiOutlineArrowRightCircle className="h-4 w-4" />
              Resume consultation
            </button>
          ) : canStart ? (
            <button
              onClick={() => onStart(appointment)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
            >
              {busy ? (
                <>
                  <HiOutlineClock className="h-4 w-4" />
                  Starting…
                </>
              ) : (
                <>
                  <HiOutlinePlay className="h-4 w-4" />
                  Start consultation
                </>
              )}
            </button>
          ) : (
            <span className="text-xs font-semibold text-slate-400">{status.label}</span>
          )}

          {onViewDetails && (
            <button onClick={() => onViewDetails(appointment)} className={cardLinkClass}>
              View details
            </button>
          )}
        </div>

        <span className="text-xs text-slate-400">{appointmentTime}</span>
      </RecordCardFooter>
    </RecordCard>
  );
}
