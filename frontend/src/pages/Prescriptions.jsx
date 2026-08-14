import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiOutlineCheckBadge,
  HiOutlineChevronDown,
  HiOutlineClipboardDocumentList,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
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
  RecordCardPanel,
  RecordGrid,
  RecordGridSkeleton,
  cardLinkClass,
  cardToggleClass,
} from "../components/RecordCard";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchPrescriptions } from "../services/prescriptionService";

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "year", label: "Last year" },
];

const VERIFIED = [
  { value: "", label: "All" },
  { value: "true", label: "Verified" },
  { value: "false", label: "Unverified" },
];

const selectClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** One prescribed medicine, stacked rather than tabulated.
 *
 * The card is a third of a row wide now, so the five-column table this
 * replaced could only ever be read by scrolling it sideways. Stacking keeps
 * the dose line intact at every breakpoint. */
function MedicineRow({ medicine }) {
  const schedule = [medicine.dose, medicine.frequency, medicine.duration]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-xl border border-slate-100 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium text-slate-800">
          {medicine.medicine_name}
        </p>
        {medicine.quantity && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            ×{medicine.quantity}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{schedule || "No schedule recorded"}</p>
      {medicine.instructions && (
        <p className="mt-0.5 text-xs text-slate-500">{medicine.instructions}</p>
      )}
      {medicine.notes && (
        <p className="mt-0.5 text-xs italic text-slate-400">Note: {medicine.notes}</p>
      )}
    </li>
  );
}

function PrescriptionCard({ record }) {
  const [expanded, setExpanded] = useState(false);
  const medicines = record.medicines || [];
  const patient = record.patient || {};

  return (
    <RecordCard>
      <RecordCardBody>
        <RecordCardHeader
          name={patient.name}
          lines={[
            [
              patient.code,
              patient.age != null && `${patient.age} yrs`,
              patient.gender,
            ]
              .filter(Boolean)
              .join(" · "),
            record.doctor || "—",
          ]}
        />

        <RecordCardBadges>
          <Badge
            tone={record.verified ? "emerald" : "amber"}
            icon={HiOutlineCheckBadge}
            title={
              record.verified
                ? `Signed off by ${record.verified_by || "the treating doctor"}`
                : "The treating doctor has not signed this off yet"
            }
          >
            {record.verified ? "Verified" : "Unverified"}
          </Badge>
          {record.session_number > 1 && (
            <Badge tone="brand">Session {record.session_number}</Badge>
          )}
          <Badge>
            {medicines.length} medicine{medicines.length === 1 ? "" : "s"}
          </Badge>
        </RecordCardBadges>

        <p className="mt-3 text-sm text-slate-500">
          {record.consulted_at
            ? new Date(record.consulted_at).toLocaleString()
            : "Date not recorded"}
        </p>

        {expanded && (
          <RecordCardPanel>
            {medicines.length === 0 ? (
              <p className="text-sm text-slate-400">No medicines on this prescription.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {medicines.map((m, i) => (
                  <MedicineRow key={i} medicine={m} />
                ))}
              </ul>
            )}

            {record.case_id && (
              <Link
                to={`/dashboard/cases/${record.case_id}`}
                className="mt-3 inline-block text-xs font-semibold text-brand-600 transition hover:text-brand-700"
              >
                View the whole course of treatment →
              </Link>
            )}
          </RecordCardPanel>
        )}
      </RecordCardBody>

      <RecordCardFooter>
        <Link
          to={`/dashboard/consultations/${record.consultation_id}`}
          className={cardLinkClass}
        >
          Open consultation
        </Link>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cardToggleClass}
        >
          {expanded ? "Less" : "Medicines"}
          <HiOutlineChevronDown
            className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </RecordCardFooter>
    </RecordCard>
  );
}

/**
 * Every prescription written, and the medicines on it.
 *
 * Read-only. A prescription is created by ending a consultation and changed
 * only by the treating doctor in the consultation room — editing one from a
 * history page would put it out of step with the visit it belongs to.
 */
export default function Prescriptions() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") || "";
  const period = searchParams.get("period") || "all";
  const verified = searchParams.get("verified") || "";
  const page = Number(searchParams.get("page") || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => setSearchInput(search), [search]);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = { page, page_size: 20 };
      if (search) params.search = search;
      if (period !== "all") params.period = period;
      if (verified) params.verified = verified;
      return fetchPrescriptions(params)
        .then((data) => {
          setRecords(data.items || []);
          setMeta(data.meta || null);
          setErrorMsg("");
        })
        .catch((err) =>
          setErrorMsg(err.response?.data?.message || "Could not load prescriptions.")
        )
        .finally(() => setLoading(false));
    },
    [search, period, verified, page]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A consultation finishing anywhere adds a prescription here.
  useLiveRefresh(load);

  function setParam(key, value, defaultValue = "") {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  }

  const hasFilters = Boolean(search || period !== "all" || verified);

  return (
    <div>
      <PageHeader icon={HiOutlineClipboardDocumentList} title="Prescriptions" />

      {/* The search form takes the whole row on a phone and shares it with the
          selects from `sm` up, rather than all four controls fighting over
          375px. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam("search", searchInput.trim());
          }}
          className="flex w-full items-center gap-2 sm:w-auto sm:min-w-72 sm:flex-1"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Patient, doctor or medicine…"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setParam("search", "");
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
          value={verified}
          onChange={(e) => setParam("verified", e.target.value)}
          aria-label="Filter by verification"
          className={selectClass}
        >
          {VERIFIED.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => setSearchParams({}, { replace: true })}
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
        {meta ? `${meta.total} prescription${meta.total === 1 ? "" : "s"}` : "Loading…"}
        {hasFilters && " matching your filters"}
      </p>

      <div className="mt-3">
        {loading ? (
          <RecordGridSkeleton />
        ) : records.length === 0 ? (
          <EmptyState icon={HiOutlineClipboardDocumentList}>
            {hasFilters
              ? "No prescription matches those filters."
              : "No prescriptions yet. One is saved here automatically each time a consultation ends with medicines prescribed."}
          </EmptyState>
        ) : (
          // align="start": each card owns its own `expanded` state, but on a
          // stretched grid opening one card grows the whole row, and its
          // neighbours are stretched to match — which reads as every card
          // having expanded. Opting out of the stretch lets the opened card
          // grow alone.
          <RecordGrid align="start">
            {records.map((r) => (
              <PrescriptionCard key={r.consultation_id} record={r} />
            ))}
          </RecordGrid>
        )}
      </div>

      {meta && meta.pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Page {meta.page} of {meta.pages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setParam("page", String(page - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setParam("page", String(page + 1))}
              disabled={page >= meta.pages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
