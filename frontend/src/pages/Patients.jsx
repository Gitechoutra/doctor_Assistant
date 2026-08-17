import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HiOutlineUserPlus, HiOutlineUsers } from "react-icons/hi2";
import ConfirmDialog from "../components/ConfirmDialog";
import PatientCard from "../components/PatientCard";
import PatientFormModal from "../components/PatientFormModal";
import SearchInput from "../components/SearchInput";
import useDebouncedValue from "../hooks/useDebouncedValue";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { useAuth } from "../context/AuthContext";
import { fetchQueue } from "../services/appointmentService";
import {
  createPatient,
  deletePatient,
  fetchPatients,
  updatePatient,
} from "../services/patientService";
import {
  canDeletePatient,
  canEditPatient,
  canRegisterPatient,
} from "../utils/permissions";

// One card carries a name, an age, a phone number and a status now, so the
// grid packs a little looser than a name-only card did: one per row on a
// phone, two on a tablet, three or four across a desktop. `auto-rows-fr`
// keeps every card in a row the same height whatever its buttons, and the
// fixed column counts (rather than auto-fit) stop a wide screen from ever
// drawing a card narrower than a long name can sit in.
const GRID =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 auto-rows-fr";

const PERIODS = [
  { key: "all", label: "All patients" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom date" },
];

/** A local YYYY-MM-DD. Deliberately not `toISOString().slice(0, 10)`, which
 *  is the UTC date: east of UTC that is yesterday's for the first hours of
 *  the evening, so "today" would quietly ask the server for the wrong day. */
function ymd(date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The registration window each filter means, as the inclusive `{ date_from,
 * date_to }` the API takes. `all` is both ends open.
 *
 * The week runs from Monday, not from seven days ago: "this week" is the week
 * the practice is in, and a rolling window would answer a different question
 * on a Tuesday than the person asking it has in mind. Both it and "this
 * month" end today rather than at the period's end — nobody is registered in
 * the future, and an open end is one less thing to get wrong.
 */
function rangeFor(period, customDate) {
  const today = new Date();
  switch (period) {
    case "today":
      return { date_from: ymd(today), date_to: ymd(today) };
    case "week": {
      const monday = new Date(today);
      // getDay() is 0 for Sunday, which is the end of the week here, not the
      // start — hence the 6-day step back rather than 0.
      monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
      return { date_from: ymd(monday), date_to: ymd(today) };
    }
    case "month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { date_from: ymd(first), date_to: ymd(today) };
    }
    case "custom":
      return customDate ? { date_from: customDate, date_to: customDate } : {};
    default:
      return {};
  }
}

/**
 * The practice's patient list.
 *
 * Searching happens as you type. The value the query uses is debounced (see
 * `useDebouncedValue`), so typing "Rahul" costs one request rather than five,
 * and the matching is a substring on the server — "rah" finds Rahul, and it
 * finds Sriram too, because half a name is what somebody actually remembers.
 * A patient ID (PAT0004) and a phone number match the same way.
 *
 * The date filters narrow by *registration* date, and they narrow on the
 * server. That matters more than it looks: a filter applied in the browser
 * can only sift the rows already fetched, so "registered this month" would
 * silently mean "of the ones on screen, the ones from this month" — the same
 * words for a different and much smaller answer. Search and date compose, so
 * "Ramu" + "This month" is one request.
 *
 * Both live in the URL, which is what makes a filtered list something you can
 * refresh, bookmark or link somebody to — and is how the dashboard's "Total
 * Patients Today" card lands here already filtered.
 *
 * `?new=1` opens the registration form on arrival, for any link that means
 * "register somebody" rather than "show me the list".
 *
 * Booking is not done from here. It belongs where the appointment book and the
 * patient's own record are — Appointments has "Book appointment", and the
 * record has it beside everything else known about the patient — and a Book
 * button on every card in a directory was three ways into one modal.
 */
export default function Patients() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const period = params.get("period") || "all";
  const customDate = params.get("date") || "";
  const search = params.get("q") || "";

  // Local mirror so typing stays responsive while the URL catches up.
  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebouncedValue(searchInput);

  const [patients, setPatients] = useState([]);
  // patient id -> today's queue row, for the position and status on the card.
  // Taken from the same endpoint the queue board reads, so a patient told
  // "you are third" is third on every screen that says so.
  const [queueRows, setQueueRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [editing, setEditing] = useState(null);
  const [registering, setRegistering] = useState(params.get("new") === "1");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const canRegister = canRegisterPatient(user?.role);
  const canEdit = canEditPatient(user?.role);
  const canDelete = canDeletePatient(user?.role);

  // Whether the box is still waiting for its results, which is what the
  // spinner in SearchInput reports. True only while the typed value and the
  // one being queried disagree — so it appears during the debounce pause and
  // clears when the answer lands.
  const searching = searchInput !== debouncedSearch;

  const range = useMemo(() => rangeFor(period, customDate), [period, customDate]);

  // The debounced term is written back to the URL rather than the keystroke,
  // so the history holds searches somebody made and not every prefix of them.
  useEffect(() => {
    if (debouncedSearch === search) return;
    const next = new URLSearchParams(params);
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      try {
        // The queue is a nicety on this page — a number and a status beside
        // the few patients who are here right now — so it fails quietly. A
        // queue that could not be read should not empty the patient list.
        const [rows, queue] = await Promise.all([
          fetchPatients("all", debouncedSearch, undefined, range),
          fetchQueue().catch(() => null),
        ]);
        setPatients(rows);
        if (queue) {
          setQueueRows(Object.fromEntries(queue.map((a) => [a.patient_id, a])));
        }
        setErrorMsg("");
      } catch (err) {
        setErrorMsg(err.response?.data?.message || "Could not load patients.");
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, range]
  );

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load);

  // The `?new=1` that opened the form is consumed once, so a refresh does not
  // reopen it and the back button behaves.
  useEffect(() => {
    if (params.get("new") === "1") {
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPeriod(key) {
    const next = new URLSearchParams(params);
    if (key === "all") next.delete("period");
    else next.set("period", key);
    // A date only means anything alongside "custom", and leaving a stale one
    // in the URL would make the back button restore a filter nobody can see.
    if (key !== "custom") next.delete("date");
    else if (!next.get("date")) next.set("date", ymd(new Date()));
    setParams(next, { replace: true });
  }

  function setCustomDate(value) {
    const next = new URLSearchParams(params);
    next.set("period", "custom");
    if (value) next.set("date", value);
    else next.delete("date");
    setParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchInput("");
    setParams({}, { replace: true });
  }

  const hasFilters = period !== "all" || Boolean(search);

  async function handleRegister(payload) {
    await createPatient(payload);
    load(true);
  }

  async function handleEdit(payload) {
    await updatePatient(editing.id, payload);
    load(true);
  }

  async function handleDelete() {
    const patient = confirmDelete;
    setConfirmDelete(null);
    try {
      await deletePatient(patient.id);
      load(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not delete this patient.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
        </div>
        {canRegister && (
          <button
            onClick={() => setRegistering(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <HiOutlineUserPlus className="h-4.5 w-4.5" />
            Add patient
          </button>
        )}
      </header>

      {/* Stacks on a phone, sits on one line from `sm` up. The filter row
          scrolls sideways inside itself rather than widening the page — five
          chips do not fit across 375px, and a page that scrolls horizontally
          is a page whose header drifts off. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          busy={searching}
          placeholder="Search by name, patient ID or phone number…"
          className="lg:max-w-md lg:flex-1"
        />
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {PERIODS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setPeriod(entry.key)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                period === entry.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <input
            type="date"
            value={customDate}
            max={ymd(new Date())}
            onChange={(e) => setCustomDate(e.target.value)}
            aria-label="Registered on"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        )}

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="self-start whitespace-nowrap text-sm font-semibold text-brand-600 transition hover:text-brand-700 lg:self-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {!loading && (
        <p className="text-sm text-slate-500">
          {patients.length} patient{patients.length === 1 ? "" : "s"}
          {hasFilters && " matching your filters"}
        </p>
      )}

      {loading ? (
        <div className={GRID}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : patients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <HiOutlineUsers className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            {hasFilters ? "No patients match those filters" : "No patients yet"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
            {hasFilters
              ? "Try part of a name, a phone number, or a patient ID like PAT0004 — or widen the date range."
              : canRegister
                ? "Register the first patient to get started."
                : "Patients appear here once the PA has registered them."}
          </p>
        </div>
      ) : (
        <div className={GRID}>
          {patients.map((patient) => (
            <PatientCard
              key={patient.id}
              patient={patient}
              queueNumber={queueRows[patient.id]?.queue_number}
              status={queueRows[patient.id]?.status}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setEditing(patient)}
              onDelete={() => setConfirmDelete(patient)}
            />
          ))}
        </div>
      )}

      {registering && (
        <PatientFormModal onClose={() => setRegistering(false)} onSave={handleRegister} />
      )}

      {editing && (
        <PatientFormModal
          patient={editing}
          onClose={() => setEditing(null)}
          onSave={handleEdit}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.name}?`}
          message="This removes the registration. A patient with a consultation or case on file cannot be deleted — those are medical records and are kept."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
