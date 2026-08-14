import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlineCalendarDays, HiOutlineMagnifyingGlass } from "react-icons/hi2";
import AppointmentCard from "../components/AppointmentCard";
import DoctorQueueCard from "../components/DoctorQueueCard";
import FilterChip from "../components/FilterChip";
import OpHistoryCard from "../components/OpHistoryCard";
import {
  EmptyState,
  PageHeader,
  RecordGrid,
  RecordGridSkeleton,
} from "../components/RecordCard";
import { useAuth } from "../context/AuthContext";
import useLiveRefresh from "../hooks/useLiveRefresh";
import {
  fetchAppointmentHistory,
  fetchAppointments,
  startAppointment,
} from "../services/appointmentService";
import { fetchDoctors } from "../services/doctorService";
import { canRunConsultation } from "../utils/permissions";
import { bucketFor, doctorIdOf, groupByDoctor } from "../utils/queue";

const DATE_FILTERS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

// Local calendar date, not `toISOString()` — that converts to UTC first,
// which shifts the date near midnight in any timezone ahead of UTC.
function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The {date_from, date_to} bounds for a period filter, today's date as the anchor. */
function dateRangeFor(filter) {
  const now = new Date();
  if (filter === "week") {
    const day = now.getDay(); // 0 = Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { date_from: dateStr(monday), date_to: dateStr(sunday) };
  }
  if (filter === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { date_from: dateStr(first), date_to: dateStr(last) };
  }
  const today = dateStr(now);
  return { date_from: today, date_to: today };
}

export default function Appointments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // A doctor's own queue is one department, already narrowed server-side —
  // the flat card grid still fits that. Reception and admin see every
  // department mixed together, which is what the doctor-grouped view below
  // exists to sort back out; both already shared this "All departments"
  // branch before the grouping existed; see the `description` text.
  const isDoctorView = Boolean(user?.department);

  // Starting or resuming a consultation is the doctor's, and the server
  // narrows it further to the doctor the appointment belongs to.
  const canConsult = canRunConsultation(user?.role);

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Set by the "Active Consultations" card: only the patients in a room now.
  const ongoingOnly = searchParams.get("status") === "in_progress";

  // Two views of the same OPs, split on the one thing that distinguishes them:
  // the queue is every OP still open, the history is every OP that has closed.
  // Kept in the URL so a history page survives a refresh and can be linked to.
  const isHistory = searchParams.get("view") === "history";

  // The server orders ongoing first, then the queue oldest-first, so the
  // first waiting row is the patient to call in next.
  const ongoingCount = appointments.filter((a) => a.status === "in_progress").length;
  const nextInQueueId = appointments.find((a) => a.status === "waiting")?.id;

  // `silent` skips the skeleton: a live refresh should update the queue in
  // place, not blank it out while a doctor is looking at it.
  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const listParams = {};
      if (ongoingOnly) listParams.status = "in_progress";
      return fetchAppointments(listParams)
        .then((a) => {
          setAppointments(a);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load the appointment queue."))
        .finally(() => setLoading(false));
    },
    [ongoingOnly]
  );

  // Re-runs when a filter changes, so clearing a chip refetches the
  // unfiltered list rather than just relabelling the same rows.
  useEffect(() => {
    load();
  }, [load]);

  // A patient being called in or finishing elsewhere changes this queue.
  useLiveRefresh(load);

  // --- History (closed OPs) -------------------------------------------------

  const [history, setHistory] = useState([]);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearchInput, setHistorySearchInput] = useState("");
  const [historySearch, setHistorySearch] = useState("");

  const loadHistory = useCallback(
    (silent = false) => {
      // Only fetched while the tab is open. The history only ever grows, and
      // nobody looking at the live queue is waiting on it.
      if (!isHistory) return undefined;
      if (!silent) setHistoryLoading(true);
      const params = { page: historyPage, page_size: 20 };
      if (historySearch) params.search = historySearch;
      return fetchAppointmentHistory(params)
        .then((data) => {
          setHistory(data.items || []);
          setHistoryMeta(data.meta || null);
          // An empty history is the normal state for a hospital that has not
          // finished a consultation yet — not a failure, and not a banner.
          setHistoryError("");
        })
        .catch(() => setHistoryError("Could not load the OP history."))
        .finally(() => setHistoryLoading(false));
    },
    [isHistory, historyPage, historySearch]
  );

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // A consultation ending is exactly what moves an OP into this list.
  useLiveRefresh(loadHistory);

  function switchView(next) {
    const params = new URLSearchParams(searchParams);
    if (next === "history") params.set("view", "history");
    else params.delete("view");
    // The ongoing-only chip belongs to the queue; carrying it into the
    // history would filter on a status the history never contains.
    params.delete("status");
    setSearchParams(params, { replace: true });
  }

  // --- Doctor-grouped view (reception/admin only) ---------------------------

  const [doctors, setDoctors] = useState([]);
  const [dateFilter, setDateFilter] = useState("today");
  const [periodAppointments, setPeriodAppointments] = useState([]);

  // A doctor's patients are a page of their own, not a panel underneath these
  // cards: the queue is the thing being read, and the id in the URL means it
  // survives a refresh and can be linked to.
  function handleViewPatients(doctor) {
    navigate(`/dashboard/appointments/doctors/${doctor.id}`);
  }

  useEffect(() => {
    if (isDoctorView) return;
    fetchDoctors()
      .then(setDoctors)
      .catch(() => setDoctors([]));
  }, [isDoctorView]);

  const loadPeriod = useCallback(() => {
    if (isDoctorView || isHistory) return undefined;
    return fetchAppointments(dateRangeFor(dateFilter))
      .then(setPeriodAppointments)
      .catch(() => setPeriodAppointments([]));
  }, [isDoctorView, isHistory, dateFilter]);

  useEffect(() => {
    loadPeriod();
  }, [loadPeriod]);

  useLiveRefresh(loadPeriod);

  const queueByDoctor = useMemo(() => groupByDoctor(appointments), [appointments]);
  const periodCountByDoctor = useMemo(() => {
    const counts = new Map();
    for (const appointment of periodAppointments) {
      const id = doctorIdOf(appointment);
      if (id == null) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [periodAppointments]);

  const periodLabel = DATE_FILTERS.find((f) => f.key === dateFilter)?.label.toLowerCase();

  function clearFilter(key) {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: true });
  }

  async function handleStart(appointmentId) {
    setStartingId(appointmentId);
    setErrorMsg("");
    try {
      const consultation = await startAppointment(appointmentId);
      navigate(`/dashboard/consultations/${consultation.id}`);
    } catch (err) {
      // 409 when someone else already picked the patient up or the patient
      // was already seen today, 403 when it's another department's queue —
      // all worth showing rather than leaving the button silently stuck.
      //
      // A same-day 409 carries the consultation to carry on with, so the
      // doctor lands in the right room instead of having to hunt for it.
      const existingId = err.response?.data?.errors?.consultation_id;
      if (existingId) {
        navigate(`/dashboard/consultations/${existingId}`);
        return;
      }
      setErrorMsg(err.response?.data?.message || "Could not start that consultation.");
      load();
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div>
      <PageHeader icon={HiOutlineCalendarDays} title="Appointments" />

      {/* The queue is the work list — only OPs still open. A completed OP is
          not deleted, it moves to History, which is the other half of the same
          set (see the backend's CLOSED_STATUSES). */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          ["queue", "Queue"],
          ["history", "History"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => switchView(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              (value === "history") === isHistory
                ? "bg-brand-600 text-white shadow-md"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* flex-wrap: the counts line plus both filter chips overflow a
          narrow viewport if they are forced onto one row. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">
          {isHistory
            ? `${historyMeta?.total ?? 0} closed OP${historyMeta?.total === 1 ? "" : "s"}`
            : `${user?.department ? `${user.department} queue` : "All departments"} · ${
                appointments.length
              } OP${appointments.length === 1 ? "" : "s"} · ${ongoingCount} in consultation · ${
                appointments.length - ongoingCount
              } waiting`}
        </p>
        {!isHistory && ongoingOnly && (
          <FilterChip label="In consultation" onClear={() => clearFilter("status")} />
        )}
      </div>

      {!isDoctorView && !isHistory && (
        <div className="mt-4 flex flex-wrap gap-2">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                dateFilter === f.key
                  ? "bg-brand-600 text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {(isHistory ? historyError : errorMsg) && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {isHistory ? historyError : errorMsg}
        </p>
      )}

      {isHistory ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setHistoryPage(1);
              setHistorySearch(historySearchInput.trim());
            }}
            className="mt-5 flex w-full items-center gap-2 sm:max-w-md"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={historySearchInput}
                onChange={(e) => setHistorySearchInput(e.target.value)}
                aria-label="Search closed OPs"
                placeholder="Patient name or reason…"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              Search
            </button>
          </form>

          <div className="mt-6">
            {historyLoading ? (
              <RecordGridSkeleton count={3} />
            ) : history.length === 0 ? (
              <EmptyState icon={HiOutlineCalendarDays}>
                {historySearch ? "No closed OP matches that search." : "No OP history yet"}
              </EmptyState>
            ) : (
              // align="start" so opening one card's details doesn't stretch
              // its neighbours to match — same rule as every expandable grid.
              <RecordGrid align="start">
                {history.map((record) => (
                  <OpHistoryCard key={record.id} record={record} />
                ))}
              </RecordGrid>
            )}
          </div>

          {historyMeta && historyMeta.pages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Page {historyMeta.page} of {historyMeta.pages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setHistoryPage((p) => p + 1)}
                  disabled={historyPage >= historyMeta.pages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
      <div className="mt-6">
        {isDoctorView ? (
          loading ? (
            <RecordGridSkeleton count={3} />
          ) : appointments.length === 0 ? (
            <EmptyState icon={HiOutlineCalendarDays}>No appointments</EmptyState>
          ) : (
            <RecordGrid>
              {appointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  isNext={a.id === nextInQueueId}
                  busy={startingId === a.id}
                  canConsult={canConsult}
                  onStart={(appt) => handleStart(appt.id)}
                  onResume={(appt) => navigate(`/dashboard/consultations/${appt.consultation_id}`)}
                />
              ))}
            </RecordGrid>
          )
        ) : loading ? (
          <RecordGridSkeleton count={3} />
        ) : doctors.length === 0 ? (
          <EmptyState icon={HiOutlineCalendarDays}>No doctors are set up yet.</EmptyState>
        ) : (
          <RecordGrid>
            {doctors.map((doctor) => {
              const bucket = bucketFor(queueByDoctor, doctor.id);
              return (
                <DoctorQueueCard
                  key={doctor.id}
                  doctor={doctor}
                  current={bucket.current}
                  waiting={bucket.waiting}
                  periodCount={periodCountByDoctor.get(doctor.id) || 0}
                  periodLabel={periodLabel}
                  onViewPatients={handleViewPatients}
                />
              );
            })}
          </RecordGrid>
        )}
      </div>
      )}
    </div>
  );
}
