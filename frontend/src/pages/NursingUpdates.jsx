import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineArrowsRightLeft,
  HiOutlineBeaker,
  HiOutlineBellAlert,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineHeart,
  HiOutlinePencilSquare,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import { formatWhen } from "../components/nursing/NursingBadges";
import useLiveNursing from "../hooks/useLiveNursing";
import { fetchNursingUpdates } from "../services/nursingService";

const KIND_META = {
  medication: { icon: HiOutlineBeaker, label: "Medication", tone: "bg-sky-100 text-sky-700" },
  observation: { icon: HiOutlineHeart, label: "Observation", tone: "bg-violet-100 text-violet-700" },
  note: { icon: HiOutlinePencilSquare, label: "Nursing note", tone: "bg-slate-100 text-slate-600" },
  handover: {
    icon: HiOutlineArrowsRightLeft,
    label: "Handover",
    tone: "bg-indigo-100 text-indigo-700",
  },
  alert: { icon: HiOutlineBellAlert, label: "Alert", tone: "bg-red-100 text-red-700" },
  message: {
    icon: HiOutlineChatBubbleLeftRight,
    label: "Message",
    tone: "bg-emerald-100 text-emerald-700",
  },
};

const FILTERS = [
  { key: "new", label: "New for me" },
  { key: "all", label: "Everything" },
];

/**
 * What the nurses have been doing, across every patient this doctor has handed
 * over.
 *
 * The per-record timeline answers "what happened to this patient". This
 * answers "what happened while I was away", which is the question a doctor
 * actually opens the app with after a shift.
 */
export default function NursingUpdates() {
  const [filter, setFilter] = useState("new");
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchNursingUpdates(
        filter === "new" ? { unreviewed: "true" } : { status: "all" }
      )
        .then((rows) => {
          setUpdates(rows);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load nursing updates."))
        .finally(() => setLoading(false));
    },
    [filter]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A dose logged on the ward should appear here without a reload.
  useLiveNursing(load);

  // Grouped by patient so a doctor reads one patient's story at a time rather
  // than an interleaved stream of six people's vitals.
  const byPatient = updates.reduce((acc, u) => {
    (acc[u.assignment_id] ||= { patient: u, items: [] }).items.push(u);
    return acc;
  }, {});
  const groups = Object.entries(byPatient);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Nursing updates</h1>
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === f.key
                  ? "bg-brand-600 text-white shadow-md"
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
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <HiOutlineCheckCircle className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            {filter === "new"
              ? "Nothing new since you last reviewed."
              : "No nursing activity yet."}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Updates appear here as your nurses log doses, vitals and notes.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map(([assignmentId, { patient, items }]) => (
            <div
              key={assignmentId}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
            >
              <Link
                to={`/dashboard/nursing/${assignmentId}`}
                className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 transition hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    name={patient.patient}
                    imageUrl={patient.patient_photo_url}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{patient.patient}</p>
                    <p className="text-xs text-slate-400">
                      {patient.patient_code} · nursed by {patient.nurse}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-brand-600">
                  {items.length} update{items.length === 1 ? "" : "s"} · open record →
                </span>
              </Link>

              <ol className="divide-y divide-slate-50">
                {items.map((u, i) => {
                  const meta = KIND_META[u.kind] || KIND_META.note;
                  const Icon = meta.icon;
                  return (
                    <li
                      key={`${u.assignment_id}-${u.at}-${i}`}
                      className={`flex gap-3 px-6 py-3 ${u.is_new ? "bg-brand-50/40" : ""}`}
                    >
                      <span
                        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${meta.tone}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">
                            {meta.label}
                            {u.is_new && (
                              <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                                New
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400">{formatWhen(u.at)}</p>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                          {u.summary}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
