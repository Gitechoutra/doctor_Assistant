import { Link } from "react-router-dom";
import { HiOutlinePencilSquare, HiOutlinePhone, HiOutlineTrash } from "react-icons/hi2";
import Avatar from "./Avatar";
import StatusBadge from "./StatusBadge";

/** "17 Aug 2026" — the registration date, without a time. What somebody wants
 *  from it is which day the patient joined the books, and the minute they were
 *  typed in is noise beside a name. */
function registeredOn(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One patient in the Patients list.
 *
 * Name, then age · gender, then the phone number. Those three are on the card
 * rather than one click inside it because they are what tells two patients
 * apart: a list with two people called Ramu on it is not a list you can act
 * on, and the age settles which is which faster than opening both. The phone
 * number is here for the same reason it is on an appointment row — ringing a
 * patient back is the commonest thing anybody does from a directory, and it
 * should not cost a page load.
 *
 * Everything else — allergies, blood group, history — stays in the record.
 * The line between them is whether the field helps you choose a card or only
 * makes sense once you have chosen one.
 *
 * `status` is where the patient is in their day, from today's queue, and is
 * absent for the majority who are simply on the books; the card draws nothing
 * rather than an empty slot.
 */
export default function PatientCard({
  patient,
  status,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}) {
  const identity = [
    patient.age != null ? `${patient.age} yrs` : null,
    patient.gender,
  ]
    .filter(Boolean)
    .join(" · ");
  const registered = registeredOn(patient.created_at);

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200 hover:shadow-md">
      <Link
        to={`/dashboard/patients/${patient.id}`}
        className="group flex min-w-0 items-start gap-3 focus:outline-none"
      >
        <Avatar name={patient.name} imageUrl={patient.photo_url} size="md" />
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-semibold text-slate-800 group-hover:text-brand-700"
            title={patient.name}
          >
            {patient.name}
          </p>
          <p className="truncate text-xs text-slate-500">
            {[patient.code, identity].filter(Boolean).join(" · ")}
          </p>
        </div>
      </Link>

      {/* Wraps rather than truncating: half a phone number reads as a whole
          one, and dialling it gets you a stranger. */}
      {patient.phone && (
        <p className="flex items-center gap-1.5 break-all text-xs text-slate-600">
          <HiOutlinePhone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {patient.phone}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status ? (
          <StatusBadge status={status} />
        ) : (
          <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
            Registered
          </span>
        )}
        {registered && (
          <span className="text-[11px] text-slate-400" title="Registration date">
            {registered}
          </span>
        )}
      </div>

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
