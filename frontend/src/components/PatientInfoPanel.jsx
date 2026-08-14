function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value || "—"}</p>
    </div>
  );
}

export default function PatientInfoPanel({ patient }) {
  if (!patient) return null;

  const initials = patient.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{patient.name}</p>
          <p className="text-xs text-slate-400 capitalize">
            {patient.gender || "—"} · ID: PAT{String(patient.id).padStart(4, "0")}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Phone" value={patient.phone} />
        <Field label="Email" value={patient.email} />
        <Field label="Blood Group" value={patient.blood_group} />
        <Field label="Allergies" value={patient.allergies} />
        <Field label="Medical History" value={patient.medical_history} />
      </div>
    </div>
  );
}
