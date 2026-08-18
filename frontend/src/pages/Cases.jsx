import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckBadge,
  HiOutlineDocumentText,
  HiOutlineFolderOpen,
} from "react-icons/hi2";
import {
  Badge,
  EmptyState,
  PageHeader,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordGrid,
  RecordGridSkeleton,
  cardLinkClass,
} from "../components/RecordCard";
import SearchInput from "../components/SearchInput";
import useDebouncedValue from "../hooks/useDebouncedValue";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchCases } from "../services/caseService";
import { downloadReport } from "../services/reportService";

const STATUSES = [
  { value: "all", label: "All cases" },
  { value: "open", label: "In treatment" },
  { value: "closed", label: "Closed" },
];

function CaseRow({ caseRecord, onDownloadReport, downloading }) {
  const isOpen = caseRecord.status === "open";
  const sessions = caseRecord.session_count;
  const when = caseRecord.closed_at || caseRecord.opened_at;

  return (
    <RecordCard accent={caseRecord.has_open_session ? "emerald" : undefined}>
      <RecordCardBody>
        <RecordCardHeader
          name={caseRecord.patient}
          lines={[[caseRecord.code, caseRecord.doctor].filter(Boolean).join(" · ")]}
        />

        <RecordCardBadges>
          <Badge tone={isOpen ? "emeraldSolid" : "slateSolid"}>
            {isOpen ? "In treatment" : "Treatment closed"}
          </Badge>
          {caseRecord.has_open_session && <Badge tone="emerald">Session recording now</Badge>}
          {caseRecord.consolidated && (
            <Badge
              tone={caseRecord.final_verified ? "emerald" : "amber"}
              icon={HiOutlineCheckBadge}
              title={
                caseRecord.final_verified
                  ? `Final prescription verified by ${caseRecord.final_verified_by || "the treating doctor"}`
                  : "The consolidated prescription has not been signed off yet"
              }
            >
              {caseRecord.final_verified ? "Final Rx verified" : "Final Rx unverified"}
            </Badge>
          )}
          {caseRecord.report && (
            <Badge tone="brand" icon={HiOutlineDocumentText}>
              Full report ready
            </Badge>
          )}
        </RecordCardBadges>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="font-medium text-slate-700">
            {sessions} session{sessions === 1 ? "" : "s"}
          </span>
          <span>
            {isOpen ? "Opened" : "Closed"} {when ? new Date(when).toLocaleDateString() : "—"}
          </span>
        </div>

        {caseRecord.reason && (
          <p className="mt-2 text-sm text-slate-500">
            <span className="font-medium text-slate-600">Reason:</span> {caseRecord.reason}
          </p>
        )}
      </RecordCardBody>

      <RecordCardFooter>
        <Link to={`/dashboard/cases/${caseRecord.id}`} className={cardLinkClass}>
          Open case
        </Link>
        {caseRecord.report && (
          <button
            onClick={() => onDownloadReport(caseRecord)}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
          >
            <HiOutlineArrowDownTray className="h-4 w-4" />
            {downloading ? "Downloading…" : "Full report"}
          </button>
        )}
      </RecordCardFooter>
    </RecordCard>
  );
}

/**
 * Courses of treatment, each holding one or more consultation sessions.
 *
 * Separate from the Consultations page on purpose: that one is the history of
 * individual visits, this one is where a doctor picks up an ongoing treatment
 * to add a session to, and where a finished treatment gets its single
 * consolidated report.
 */
export default function Cases() {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status") || "all";
  const searchTerm = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(searchTerm);
  const [cases, setCases] = useState([]);
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

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMsg("");
      const params = {};
      if (status !== "all") params.status = status;
      if (searchTerm) params.search = searchTerm;
      return fetchCases(params)
        .then(setCases)
        .catch(() => setErrorMsg("Could not load cases."))
        .finally(() => setLoading(false));
    },
    [status, searchTerm]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A session starting or ending anywhere changes this list.
  useLiveRefresh(load);

  function setParam(key, value, defaultValue) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  async function handleDownloadReport(caseRecord) {
    setDownloadingId(caseRecord.id);
    try {
      const name = (caseRecord.patient || "patient").replace(/\s+/g, "_");
      await downloadReport(caseRecord.report.id, `${name}_full_medical_report.pdf`);
    } catch {
      setErrorMsg("Could not download that report.");
    } finally {
      setDownloadingId(null);
    }
  }

  const openCount = cases.filter((c) => c.status === "open").length;
  const hasFilters = status !== "all" || Boolean(searchTerm);

  return (
    <div>
      <PageHeader icon={HiOutlineFolderOpen} title="Cases" />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          busy={searchInput !== debouncedSearch}
          placeholder="Search patient, ID or reason…"
          className="w-full sm:w-auto sm:min-w-72 sm:flex-1"
        />

        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value, "all")}
          aria-label="Filter by status"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
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
        {cases.length} case{cases.length === 1 ? "" : "s"} · {openCount} still in treatment
        {hasFilters && " matching your filters"}
      </p>

      <div className="mt-3">
        {loading ? (
          <RecordGridSkeleton count={3} />
        ) : cases.length === 0 ? (
          <EmptyState icon={HiOutlineFolderOpen}>
            {hasFilters
              ? "No cases match those filters."
              : "No cases yet. One opens automatically the first time you start a consultation with a patient, and every follow-up session joins it."}
          </EmptyState>
        ) : (
          <RecordGrid>
            {cases.map((c) => (
              <CaseRow
                key={c.id}
                caseRecord={c}
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
