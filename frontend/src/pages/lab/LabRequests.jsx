import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiOutlineBeaker,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import {
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
} from "../../components/RecordCard";
import {
  LabProgress,
  LabStatusBadge,
  PriorityBadge,
  RecollectionBadge,
  formatWhen,
} from "../../components/lab/LabBits";
import OrderLabTestModal from "../../components/lab/OrderLabTestModal";
import useLiveRefresh from "../../hooks/useLiveRefresh";
import { fetchLabRequests } from "../../services/labService";

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "ordered", label: "Ordered" },
  { value: "sample_collected", label: "Sample collected" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "verified", label: "Verified" },
  { value: "cancelled", label: "Cancelled" },
];

const selectClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function LabRequestCard({ request, basePath }) {
  return (
    <RecordCard accent={request.priority === "urgent" ? "brand" : undefined}>
      <RecordCardBody>
        <RecordCardHeader
          name={request.patient}
          lines={[
            [
              request.patient_code,
              request.patient_age != null && `${request.patient_age} yrs`,
              request.patient_gender,
            ]
              .filter(Boolean)
              .join(" · "),
            [request.doctor && `Ordered by ${request.doctor}`, request.technician]
              .filter(Boolean)
              .join(" · ") || "Not yet assigned",
          ]}
        />

        <p className="mt-3 break-words font-semibold text-slate-800">{request.test_name}</p>
        {(request.test_category || request.specimen) && (
          <p className="mt-0.5 text-xs text-slate-400">
            {[request.test_category, request.specimen].filter(Boolean).join(" · ")}
          </p>
        )}

        <RecordCardBadges>
          <LabStatusBadge status={request.status} />
          <PriorityBadge priority={request.priority} />
          <RecollectionBadge request={request} />
        </RecordCardBadges>

        <LabProgress status={request.status} />

        <p className="mt-3 text-sm text-slate-500">Ordered {formatWhen(request.created_at)}</p>
      </RecordCardBody>

      <RecordCardFooter>
        <Link to={`${basePath}/${request.id}`} className={cardLinkClass}>
          Open test
        </Link>
        {request.message_count > 0 && (
          <span className="text-xs text-slate-400">
            {request.message_count} in history
          </span>
        )}
      </RecordCardFooter>
    </RecordCard>
  );
}

/**
 * The laboratory worklist.
 *
 * One screen for all three audiences, because they want the same thing — the
 * tests that concern them — and the server already decides what that means
 * per role. `can_order` is what turns on the ordering button, so a technician
 * never sees a control that would 403.
 */
export default function LabRequests({ basePath = "/lab/requests" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "open";
  const search = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState({ items: [], can_order: false });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [ordering, setOrdering] = useState(false);

  useEffect(() => setSearchInput(search), [search]);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = {};
      if (status) params.status = status;
      if (search) params.search = search;
      return fetchLabRequests(params)
        .then((res) => {
          setData(res);
          setErrorMsg("");
        })
        .catch((err) =>
          setErrorMsg(err.response?.data?.message || "Could not load lab requests.")
        )
        .finally(() => setLoading(false));
    },
    [status, search]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A technician collecting a sample should surface on the doctor's list
  // without a reload, and vice versa.
  useLiveRefresh(load);

  function setParam(key, value, defaultValue = "") {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  const items = data.items || [];
  const urgent = items.filter((r) => r.priority === "urgent" && r.is_open).length;

  return (
    <div>
      <PageHeader
        icon={HiOutlineBeaker}
        title="Lab tests"
        action={
          data.can_order && (
            <button
              onClick={() => setOrdering(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              <HiOutlinePlus className="h-4 w-4" />
              Order a test
            </button>
          )
        }
      />

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
              placeholder="Patient, ID or test…"
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
          value={status}
          onChange={(e) => setParam("status", e.target.value, "open")}
          aria-label="Filter by status"
          className={selectClass}
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

      <p className="mt-5 text-sm text-slate-500">
        {loading ? "Loading…" : `${items.length} test${items.length === 1 ? "" : "s"}`}
        {!loading && urgent > 0 && ` · ${urgent} urgent`}
      </p>

      <div className="mt-3">
        {loading ? (
          <RecordGridSkeleton count={3} />
        ) : items.length === 0 ? (
          <EmptyState icon={HiOutlineBeaker}>
            {search || status !== "open"
              ? "No lab tests match those filters."
              : data.can_order
                ? "You haven't ordered any lab tests yet. Use “Order a test” to request one for a patient."
                : "Nothing in your worklist right now. Tests appear here when a doctor orders one and assigns it to you."}
          </EmptyState>
        ) : (
          <RecordGrid>
            {items.map((r) => (
              <LabRequestCard key={r.id} request={r} basePath={basePath} />
            ))}
          </RecordGrid>
        )}
      </div>

      {ordering && (
        <OrderLabTestModal
          onClose={() => setOrdering(false)}
          onCreated={() => {
            setOrdering(false);
            load();
          }}
        />
      )}
    </div>
  );
}
