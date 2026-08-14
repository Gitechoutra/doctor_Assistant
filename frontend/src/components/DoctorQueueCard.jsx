import { HiOutlineUserGroup } from "react-icons/hi2";
import {
  Badge,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordDetail,
  cardPrimaryClass,
} from "./RecordCard";
import { buildQueueEntries } from "../utils/queue";

/**
 * One doctor's queue, summarised for reception.
 *
 * `current` is this doctor's in-progress appointment, if any; `waiting` is
 * everyone else in their queue, already in the order the API returns them
 * (oldest first — the same ordering the flat queue uses, just split per
 * doctor here instead of shown as one combined list).
 *
 * `onViewPatients` opens this doctor's own queue page, where their patients
 * are listed in full. Nothing expands in place: the card is a summary and a
 * way in, not a container for the queue itself.
 */
export default function DoctorQueueCard({
  doctor,
  current,
  waiting,
  periodCount,
  periodLabel,
  onViewPatients,
}) {
  const { next, restNumbers } = buildQueueEntries(current, waiting);

  return (
    <RecordCard accent={current ? "emerald" : undefined}>
      <RecordCardBody>
        <RecordCardHeader
          name={doctor.name}
          lines={[doctor.department, doctor.specialization].filter(Boolean)}
        />

        <RecordCardBadges>
          <Badge tone={current ? "emeraldSolid" : "slate"}>
            {current ? "Consulting" : "Free"}
          </Badge>
        </RecordCardBadges>

        <div className="mt-4">
          <RecordDetail label={`Patients (${periodLabel})`} value={periodCount} />
        </div>

        <div className="mt-4 space-y-1 text-sm text-slate-700">
          <p>
            <span className="font-semibold text-slate-800">Currently Consulting:</span>{" "}
            {current ? current.patient : "Nobody right now"}
          </p>
          <p>
            <span className="font-semibold text-slate-800">Next:</span>{" "}
            {next ? next.patient : "Nobody waiting"}
          </p>
          <p>
            <span className="font-semibold text-slate-800">Queue:</span>{" "}
            {restNumbers.length > 0 ? restNumbers.join(", ") : "—"}
          </p>
        </div>
      </RecordCardBody>

      <RecordCardFooter>
        <button onClick={() => onViewPatients(doctor)} className={cardPrimaryClass}>
          <HiOutlineUserGroup className="h-4 w-4" />
          View Patients
        </button>
      </RecordCardFooter>
    </RecordCard>
  );
}
