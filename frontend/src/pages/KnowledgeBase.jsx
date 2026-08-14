import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiOutlineAcademicCap,
  HiOutlineCheckBadge,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from "react-icons/hi2";
import StatCard from "../components/StatCard";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchKnowledgeStats, fetchPrecedents } from "../services/knowledgeService";

const STATUSES = [
  { value: "active", label: "In use" },
  { value: "retired", label: "Withdrawn" },
  { value: "all", label: "All" },
];

function PrecedentCard({ precedent }) {
  const medicines = precedent.medicines || [];
  const context = [precedent.age_band, precedent.gender].filter(Boolean).join(" / ");

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        precedent.active ? "border-slate-100" : "border-slate-100 opacity-70"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">
              {precedent.diagnosis || "No diagnosis recorded"}
            </p>
            {precedent.active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <HiOutlineCheckBadge className="h-3.5 w-3.5" />
                Doctor-approved
              </span>
            ) : (
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                Withdrawn
              </span>
            )}
            {precedent.times_accepted > 0 && (
              <span
                title="Times a doctor kept these medicines when this case was suggested for another patient"
                className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
              >
                Reused {precedent.times_accepted}×
              </span>
            )}
          </div>

          {precedent.symptoms && (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{precedent.symptoms}</p>
          )}

          <p className="mt-2 text-xs text-slate-400">
            {/* No patient is named: a precedent is read during other people's
                consultations, so it deliberately carries clinical content and
                an age band only. */}
            {context || "Patient context not recorded"}
            {precedent.doctor && ` · approved by ${precedent.doctor}`}
            {precedent.approved_at &&
              ` · ${new Date(precedent.approved_at).toLocaleDateString()}`}
          </p>
        </div>

        {precedent.source_consultation_id && (
          <Link
            to={`/dashboard/consultations/${precedent.source_consultation_id}`}
            className="shrink-0 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Source consultation
          </Link>
        )}
      </div>

      {medicines.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Medicine</th>
                <th className="px-4 py-2 font-medium">Dose</th>
                <th className="px-4 py-2 font-medium">Frequency</th>
                <th className="px-4 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((m, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{m.medicine_name}</td>
                  <td className="px-4 py-2 text-slate-600">{m.dose || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{m.frequency || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{m.duration || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * What the AI has learned from this practice's own approved prescriptions.
 *
 * Every entry got here the same way: a doctor reviewed an AI suggestion,
 * changed whatever needed changing, and signed it off. Nothing can be added
 * from this page — that would put unreviewed treatment into future
 * suggestions, which is the one thing the sign-off requirement exists to stop.
 */
export default function KnowledgeBase() {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status") || "active";
  const searchTerm = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(searchTerm);
  const [precedents, setPrecedents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => setSearchInput(searchTerm), [searchTerm]);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMsg("");
      const params = { status };
      if (searchTerm) params.search = searchTerm;
      return Promise.all([fetchPrecedents(params), fetchKnowledgeStats()])
        .then(([rows, summary]) => {
          setPrecedents(rows);
          setStats(summary);
        })
        .catch(() => setErrorMsg("Could not load the knowledge base."))
        .finally(() => setLoading(false));
    },
    [status, searchTerm]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A prescription verified anywhere adds a case here.
  useLiveRefresh(load);

  function setParam(key, value, defaultValue) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  // How often a suggestion drawn from an approved case survived the reviewing
  // doctor — the honest measure of whether this is helping, rather than just
  // how many rows it has.
  const acceptanceRate =
    stats?.times_suggested > 0
      ? Math.round((stats.times_accepted / stats.times_suggested) * 100)
      : null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <HiOutlineAcademicCap className="h-6 w-6 text-brand-600" />
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Knowledge Base</h1>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Approved cases in use" value={stats?.active_precedents ?? "—"} />
        <StatCard label="Times suggested" value={stats?.times_suggested ?? "—"} />
        <StatCard label="Kept by the doctor" value={stats?.times_accepted ?? "—"} />
        <StatCard
          label="Suggestions kept"
          value={acceptanceRate === null ? "—" : `${acceptanceRate}%`}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam("search", searchInput.trim(), "");
          }}
          className="flex w-full items-center gap-2 sm:w-auto sm:min-w-72 sm:flex-1"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search diagnosis, symptoms or medicine…"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setParam("search", "", "");
                }}
                aria-label="Clear search"
                className="shrink-0 text-slate-400 transition hover:text-slate-600"
              >
                <HiOutlineXMark className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            Search
          </button>
        </form>

        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value, "active")}
          aria-label="Filter by status"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-5">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : precedents.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <p className="mx-auto max-w-xl text-sm text-slate-400">
              {searchTerm
                ? "No approved cases match that search."
                : status === "retired"
                  ? "No cases have been withdrawn."
                  : "Nothing learned yet. The first entry appears as soon as a doctor verifies a prescription — from then on, patients presenting the same way get that approved treatment suggested."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {precedents.map((p) => (
              <PrecedentCard key={p.id} precedent={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
