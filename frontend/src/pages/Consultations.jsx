import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";
import ConsultationCard from "../components/ConsultationCard";
import {
  EmptyState,
  PageHeader,
  RecordGrid,
  RecordGridSkeleton,
} from "../components/RecordCard";
import SearchInput from "../components/SearchInput";
import useDebouncedValue from "../hooks/useDebouncedValue";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchConsultations } from "../services/consultationService";
import { downloadReport } from "../services/reportService";

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "year", label: "Last year" },
];

const REPORT_FILTERS = [
  { value: "all", label: "All" },
  { value: "with", label: "With report" },
  { value: "without", label: "Without report" },
];

export default function Consultations() {
  const [searchParams, setSearchParams] = useSearchParams();

  const period = searchParams.get("period") || "all";
  const reportFilter = searchParams.get("report") || "all";
  const searchTerm = searchParams.get("search") || "";

  // Local mirror so typing stays responsive while the URL catches up.
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  const debouncedSearch = useDebouncedValue(searchInput);

  // The debounced term is written back to the URL rather than the keystroke:
  // the list narrows as you type, while the history holds searches somebody
  // made rather than every prefix of them. `load` keys off the URL, so this is
  // the one place typing turns into a request.
  useEffect(() => {
    if (debouncedSearch === searchTerm) return;
    setParam("search", debouncedSearch, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // `silent` skips the skeleton so a live refresh updates the history in
  // place instead of blanking the list mid-read.
  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMsg("");
      const params = {};
      if (period !== "all") params.period = period;
      if (searchTerm) params.search = searchTerm;
      return fetchConsultations(params)
        .then(setConsultations)
        .catch(() => setErrorMsg("Could not load consultations."))
        .finally(() => setLoading(false));
    },
    [period, searchTerm]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A consultation finishing anywhere adds a row to this history.
  useLiveRefresh(load);

  function setParam(key, value, defaultValue) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  async function handleDownloadReport(consultation) {
    setDownloadingId(consultation.id);
    try {
      const name = (consultation.patient || "patient").replace(/\s+/g, "_");
      await downloadReport(consultation.report.id, `${name}_consultation_report.pdf`);
    } catch {
      setErrorMsg("Could not download that report.");
    } finally {
      setDownloadingId(null);
    }
  }

  // Report presence is already in the payload, so this filter needs no
  // extra request — unlike search and period, which the server applies.
  const visible = consultations.filter((c) => {
    if (reportFilter === "with") return Boolean(c.report);
    if (reportFilter === "without") return !c.report;
    return true;
  });

  const hasFilters = period !== "all" || reportFilter !== "all" || Boolean(searchTerm);

  const selectClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <div>
      <PageHeader icon={HiOutlineChatBubbleLeftRight} title="Consultations" />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          busy={searchInput !== debouncedSearch}
          placeholder="Search patient, ID, diagnosis or symptoms…"
          className="w-full sm:w-auto sm:min-w-72 sm:flex-1"
        />

        <select
          value={period}
          onChange={(e) => setParam("period", e.target.value, "all")}
          aria-label="Filter by date"
          className={selectClass}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          value={reportFilter}
          onChange={(e) => setParam("report", e.target.value, "all")}
          aria-label="Filter by report"
          className={selectClass}
        >
          {REPORT_FILTERS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setSearchInput("");
              setSearchParams({}, { replace: true });
            }}
            className="text-sm font-semibold text-brand-600 transition hover:text-brand-700"
          >
            Clear
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <p className="mt-5 text-sm text-slate-500">
        {visible.length} completed consultation{visible.length === 1 ? "" : "s"}
        {hasFilters && " matching your filters"}
      </p>

      <div className="mt-3">
        {loading ? (
          <RecordGridSkeleton count={3} />
        ) : visible.length === 0 ? (
          <EmptyState icon={HiOutlineChatBubbleLeftRight}>
            {hasFilters
              ? "No completed consultations match those filters."
              : "No completed consultations yet. They appear here once a doctor ends one — consultations still in progress stay in Appointments."}
          </EmptyState>
        ) : (
          <RecordGrid align="start">
            {visible.map((c) => (
              <ConsultationCard
                key={c.id}
                consultation={c}
                downloading={downloadingId === c.id}
                onDownloadReport={handleDownloadReport}
              />
            ))}
          </RecordGrid>
        )}
      </div>
    </div>
  );
}
