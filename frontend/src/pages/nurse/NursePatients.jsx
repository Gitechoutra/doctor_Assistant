import { useCallback, useEffect, useState } from "react";
import useLiveNursing from "../../hooks/useLiveNursing";
import { fetchAssignments } from "../../services/nursingService";
import { AssignmentCard } from "./NurseDashboard";

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Discharged" },
  { key: "all", label: "All" },
];

export default function NursePatients() {
  const [status, setStatus] = useState("active");
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchAssignments({ status })
        .then((rows) => {
          setAssignments(rows);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load your patients."))
        .finally(() => setLoading(false));
    },
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  useLiveNursing(load);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">My patients</h1>
          <p className="mt-1 text-sm text-slate-500">
            {assignments.length} {status === "active" ? "under your care" : "in this view"}
          </p>
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                status === f.key
                  ? "bg-teal-600 text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-medium text-slate-600">Nothing here.</p>
          <p className="mt-1 text-sm text-slate-400">
            {status === "active"
              ? "You'll see a patient here as soon as a doctor assigns one to you."
              : "No patients in this view."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((a) => (
            <AssignmentCard key={a.id} assignment={a} to={`/nurse/patients/${a.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
