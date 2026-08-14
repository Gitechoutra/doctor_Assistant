import { Link } from "react-router-dom";
import {
  HiOutlineCalendarDays,
  HiOutlineExclamationTriangle,
  HiOutlinePencilSquare,
  HiOutlineTrash,
} from "react-icons/hi2";
import Avatar from "./Avatar";

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium capitalize text-slate-700">
        {value || "—"}
      </p>
    </div>
  );
}

/**
 * One patient in the Patients list.
 *
 * The card leads to the record — the name and the whole header are the link,
 * because "open this patient" is what somebody wants nine times out of ten
 * and it should not be a small target. The buttons along the bottom are the
 * exceptions, and each is drawn only for the role that may use it.
 *
 * Allergies get a line of their own when there are any. They are the one
 * field on a patient card that changes what somebody does next, and burying
 * them in the record behind a click is how a penicillin allergy gets missed.
 */
export default function PatientCard({
  patient,
  canEdit,
  canDelete,
  canBook,
  onEdit,
  onDelete,
  onBook,
}) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:border-slate-200 hover:shadow-md">
      <Link
        to={`/dashboard/patients/${patient.id}`}
        className="group flex items-start gap-3 focus:outline-none"
      >
        <Avatar name={patient.name} imageUrl={patient.photo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-semibold text-slate-800 group-hover:text-brand-700"
            title={patient.name}
          >
            {patient.name}
          </p>
          <p className="truncate text-xs text-slate-400">{patient.code}</p>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Detail label="Age" value={patient.age != null ? `${patient.age} yrs` : null} />
        <Detail label="Gender" value={patient.gender} />
        <Detail label="Phone" value={patient.phone} />
        <Detail label="Blood group" value={patient.blood_group} />
      </div>

      {patient.allergies && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
          <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="min-w-0 text-xs text-amber-800">
            <span className="font-semibold">Allergies: </span>
            {patient.allergies}
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {canBook && (
          <button
            onClick={onBook}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
          >
            <HiOutlineCalendarDays className="h-3.5 w-3.5 shrink-0" />
            Book
          </button>
        )}
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
    </div>
  );
}
