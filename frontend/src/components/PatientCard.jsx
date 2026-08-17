import { Link } from "react-router-dom";
import { HiOutlinePencilSquare, HiOutlineTrash } from "react-icons/hi2";
import Avatar from "./Avatar";

/**
 * One patient in the Patients list.
 *
 * A name and, when they are here today, their place in the queue. Nothing
 * else: age, phone, blood group and the rest are the record's, one click away
 * behind the name, and repeating them across a grid of cards made the list
 * something to read rather than something to scan.
 *
 * The card leads to the record — the whole header is the link, because "open
 * this patient" is what somebody wants nine times out of ten and it should
 * not be a small target. The buttons are the exceptions, and each is drawn
 * only for the role that may use it.
 *
 * `queueNumber` is the server's, from `/appointments/queue` — 0 for whoever is
 * with the doctor, 1..n for those waiting (see `helpers/queue_helper`). It is
 * absent for the majority of patients, who are simply on the books today, and
 * the card says nothing at all rather than showing an empty slot.
 */
export default function PatientCard({
  patient,
  queueNumber,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}) {
  const queued = queueNumber != null;
  const consulting = queueNumber === 0;

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200 hover:shadow-md">
      <Link
        to={`/dashboard/patients/${patient.id}`}
        className="group flex min-w-0 items-center gap-3 focus:outline-none"
      >
        <Avatar name={patient.name} imageUrl={patient.photo_url} size="md" />
        <p
          className="min-w-0 flex-1 truncate font-semibold text-slate-800 group-hover:text-brand-700"
          title={patient.name}
        >
          {patient.name}
        </p>
        {queued && (
          <span
            title={consulting ? "With the doctor now" : `Number ${queueNumber} in today's queue`}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
              consulting ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700"
            }`}
          >
            {consulting ? "•" : queueNumber}
          </span>
        )}
      </Link>

      {(canEdit || canDelete) && (
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              <HiOutlinePencilSquare className="h-3.5 w-3.5 shrink-0" />
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              title={`Delete ${patient.name}`}
              aria-label={`Delete ${patient.name}`}
              className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
            >
              <HiOutlineTrash className="h-3.5 w-3.5 shrink-0" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
