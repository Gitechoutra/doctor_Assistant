import { useState } from "react";
import { HiOutlineHeart, HiOutlinePencilSquare, HiOutlineTrash } from "react-icons/hi2";
import Avatar from "./Avatar";
import SurgeryStageBadge from "./SurgeryStageBadge";

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium capitalize text-slate-700">{value ?? "—"}</p>
    </div>
  );
}

function AssignDoctorSelect({ patient, doctors, onAssigned }) {
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Highlighted, because an unassigned patient is invisible to every doctor
  // until the front desk routes them — it needs to look like an open task.
  const unassigned = !patient.assigned_doctor;

  async function handleChange(e) {
    const doctorId = e.target.value;
    if (!doctorId) return;
    setSaving(true);
    setErrorMsg("");
    try {
      await onAssigned(patient.id, doctorId);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Assigned Doctor
      </p>
      <select
        value={patient.assigned_doctor_id ?? ""}
        onChange={handleChange}
        disabled={saving}
        className={`mt-1 w-full truncate rounded-lg border px-2 py-1.5 text-xs outline-none transition focus:ring-2 focus:ring-brand-100 disabled:opacity-60 ${
          unassigned
            ? "border-amber-300 bg-amber-50 font-semibold text-amber-700"
            : "border-slate-200 text-slate-700"
        }`}
      >
        <option value="">Unassigned — pick a doctor</option>
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.department ? ` (${d.department})` : ""}
          </option>
        ))}
      </select>
      {errorMsg && <p className="mt-1 text-[11px] text-red-600">{errorMsg}</p>}
    </div>
  );
}

/**
 * One patient in the Patients list, as a card.
 */
export default function PatientCard({
  patient,
  doctors,
  canReassignDoctor,
  canAssignNurse,
  canEditPatient,
  canDeletePatient,
  onAssignNurse,
  onEdit,
  onDelete,
  onAssignDoctor,
}) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={patient.name} imageUrl={patient.photo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-800" title={patient.name}>
            {patient.name}
          </p>
          <p className="truncate text-xs text-slate-400">{patient.code}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SurgeryStageBadge
              stage={patient.surgery_stage}
              daysLeft={patient.observation_days_left}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Detail label="Age" value={patient.age != null ? patient.age : null} />
        <Detail label="Gender" value={patient.gender} />
        <Detail label="Phone" value={patient.phone} />
        <Detail label="Blood Group" value={patient.blood_group} />
      </div>

      {canReassignDoctor && (
        <AssignDoctorSelect patient={patient} doctors={doctors} onAssigned={onAssignDoctor} />
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {canAssignNurse && patient.surgery_stage === "required" && (
          <button
            onClick={onAssignNurse}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"
          >
            <HiOutlineHeart className="h-3.5 w-3.5 shrink-0" />
            Assign Nurse
          </button>
        )}
        {canEditPatient && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            <HiOutlinePencilSquare className="h-3.5 w-3.5 shrink-0" />
            Edit
          </button>
        )}
        {canDeletePatient && (
          <button
            onClick={onDelete}
            title={`Delete ${patient.name}`}
            aria-label={`Delete ${patient.name}`}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
          >
            <HiOutlineTrash className="h-3.5 w-3.5 shrink-0" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
