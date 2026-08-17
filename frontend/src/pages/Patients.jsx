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
  fetchPatientCounts,
  fetchPatients,
  updatePatient,
} from "../services/patientService";
import {
  canDeletePatient,
  canEditPatient,
  canRegisterPatient,
} from "../utils/permissions";

// One card is a name and a number now, so the grid packs tighter than it did
// when each carried six fields: one per row on a phone, two on a tablet, and
// three or four across a desktop rather than a row of half-empty cards.
// `auto-rows-fr` keeps every card in a row the same height whatever its
// buttons, and the fixed column counts (rather than auto-fit) stop a wide
// screen from ever drawing a card narrower than a long name can sit in.
const GRID =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 auto-rows-fr";

const TABS = [
  { key: "all", label: "All patients" },
  { key: "awaiting", label: "Booked in" },
  { key: "consulted", label: "Seen" },
];

/**
 * The practice's patient list.
 *
 * Searching happens as you type. The value the query uses is debounced (see
 * `useDebouncedValue`), so typing "Rahul" costs one request rather than five,
 * and the matching is a substring on the server — "rah" finds Rahul, and it
 * finds Sriram too, because half a name is what somebody actually remembers.
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

  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const [patients, setPatients] = useState([]);
  const [counts, setCounts] = useState(null);
  // patient id -> today's queue position, for the number on the card. Taken
  // from the same endpoint the queue board reads, so a patient told "you are
  // third" is third on every screen that says so.
  const [queueNumbers, setQueueNumbers] = useState({});
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
  const searching = search !== debouncedSearch;

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      try {
        // The queue is a nicety on this page — a number beside the few
        // patients who are here right now — so it fails quietly. A queue that
        // could not be read should not empty the patient list.
        const [rows, tallies, queue] = await Promise.all([
          fetchPatients(scope, debouncedSearch),
          fetchPatientCounts().catch(() => null),
          fetchQueue().catch(() => null),
        ]);
        setPatients(rows);
        if (tallies) setCounts(tallies);
        if (queue) {
          setQueueNumbers(
            Object.fromEntries(queue.map((a) => [a.patient_id, a.queue_number]))
          );
        }
        setErrorMsg("");
      } catch (err) {
        setErrorMsg(err.response?.data?.message || "Could not load patients.");
      } finally {
        setLoading(false);
      }
    },
    [scope, debouncedSearch]
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

  const tabCounts = useMemo(
    () => ({
      all: counts?.total,
      awaiting: counts?.awaiting,
      consulted: counts?.consulted,
    }),
    [counts]
  );

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          busy={searching}
          className="sm:max-w-md sm:flex-1"
        />
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setScope(tab.key)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                scope === tab.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
              {tabCounts[tab.key] != null && (
                <span className="ml-1.5 tabular-nums text-slate-400">
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className={GRID}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : patients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <HiOutlineUsers className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            {debouncedSearch ? "No patients match that search" : "No patients yet"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
            {debouncedSearch
              ? "Try part of a name, a phone number, or a patient ID like PAT0004."
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
              queueNumber={queueNumbers[patient.id]}
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
