function initials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function DoctorsTable({ doctors, showDepartment = true, emptyMessage = "No doctors yet." }) {
  if (doctors.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white py-12 text-center shadow-sm">
        <p className="text-sm text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-6 py-3 font-medium">Doctor</th>
            {showDepartment && <th className="px-6 py-3 font-medium">Department</th>}
            <th className="px-6 py-3 font-medium">Specialization</th>
            <th className="px-6 py-3 font-medium">Registration No.</th>
            <th className="px-6 py-3 font-medium">Email</th>
          </tr>
        </thead>
        <tbody>
          {doctors.map((d) => (
            <tr key={d.id} className="border-b border-slate-50 last:border-0">
              <td className="px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
                    {initials(d.name)}
                  </div>
                  <span className="font-medium text-slate-800">{d.name}</span>
                </div>
              </td>
              {showDepartment && (
                <td className="px-6 py-3 text-slate-500">{d.department || "—"}</td>
              )}
              <td className="px-6 py-3 text-slate-500">{d.specialization || "—"}</td>
              <td className="px-6 py-3 text-slate-500">{d.registration_no || "—"}</td>
              <td className="px-6 py-3 text-slate-500">{d.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
