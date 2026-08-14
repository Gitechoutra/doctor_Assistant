import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  HiOutlinePlus,
  HiOutlineCheckBadge,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from "react-icons/hi2";
import AddOpModal from "../components/AddOpModal";
import ConfirmDialog from "../components/ConfirmDialog";
import PatientCard from "../components/PatientCard";
import AssignNurseModal from "../components/nursing/AssignNurseModal";
import EditPatientModal from "../components/EditPatientModal";
import { useAuth } from "../context/AuthContext";
import { canReassignDoctor, canRegisterPatient } from "../utils/permissions";
import { MIN_SEARCH_LENGTH } from "../utils/search";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchDoctors } from "../services/doctorService";
import {
  fetchPatient,
  fetchPatientCounts,
  fetchPatients,
  deletePatient,
  assignPatientDoctor,
} from "../services/patientService";

// MIN_SEARCH_LENGTH matches the API's own floor (helpers/search.py). Below it
// the server stops narrowing and answers with the whole list, which would read
// on this page as a search that matched everybody.

export default function Patients() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // A patient is admitted at the front desk and nowhere else. A doctor works
  // whoever reception routes to them; they never register a patient — and the
  // server refuses the call, so this only decides whether to draw the button.
  const canRegister = canRegisterPatient(user?.role);
  // Correcting a mis-routed patient. Front desk *and* admin, matching the
  // server's assignment route — wider than registration on purpose.
  const canReroute = canReassignDoctor(user?.role);
  // Handing a patient to a nurse is the treating doctor's call — the server
  // rejects it from anyone else. It is also offered for surgery cases only
  // (see the row below): nursing care is the post-operative watch, and the
  // API refuses the hand-off for a patient who is not on that pathway. The
  // pathway itself is driven from the consultation room.
  const canAssignNurse = user?.role === "doctor";
  // Reception typed these details in; the treating doctor may correct them
  // too. The server enforces the same pair.
  const canEditPatient = user?.role !== "nurse";
  // Removing a registration is front-desk work — the same pair the server
  // allows on the delete route. A doctor or nurse never sees the button.
  const canDeletePatient = user?.role === "receptionist" || user?.role === "admin";
  // A doctor can neither raise an OP nor reassign one, so an "awaiting"
  // patient with no appointment yet is not actionable here — and one who does
  // have an appointment already shows up as a normal card in Appointments.
  // The tab, and the banner pointing at Appointments, would just be a second
  // copy of that same queue with nothing new to do from it. Front desk and
  // admin keep both: they need this list to know who still needs an OP.
  const isDoctor = user?.role === "doctor";

  const [patients, setPatients] = useState([]);
  const [counts, setCounts] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [nursePatient, setNursePatient] = useState(null);
  const [editPatient, setEditPatient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  // Which side of the journey is on screen. Defaults to the patients whose
  // consultation is finished — anyone still pending or in progress belongs to
  // Appointments, and listing them here is what made the two sections
  // disagree about where a patient was.
  const [scope, setScope] = useState("consulted");

  // The term lives in the URL so the header's search box can land here with a
  // patient already picked out, and so the result is a page somebody can
  // bookmark or reload.
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchTerm);

  // Set by a "New patient assigned to you" notification, which names a
  // specific patient rather than a search term. That patient may not have
  // been consulted yet, so the consulted/awaiting split above would hide
  // them — fetched directly by id instead, bypassing both scope and search.
  const patientIdParam = searchParams.get("patient_id");

  function clearPatientIdParam() {
    const params = new URLSearchParams(searchParams);
    params.delete("patient_id");
    setSearchParams(params, { replace: true });
  }

  // Arriving from the header search (or the back button) has to move the box,
  // which otherwise keeps whatever was last typed into it.
  useEffect(() => setSearchInput(searchTerm), [searchTerm]);

  // The registration confirmation clears itself. It reports something that has
  // already happened, so leaving it on screen would have it still claiming a
  // patient was "just added" several patients later.
  useEffect(() => {
    if (!successMsg) return undefined;
    const timer = setTimeout(() => setSuccessMsg(""), 6000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const query = searchTerm.trim();
  // Same floor as the API, which stops narrowing below it — one character
  // would come back as the entire list and read as a broken search.
  const searching = query.length >= MIN_SEARCH_LENGTH;

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      if (patientIdParam) {
        // Fetched by id so it shows up regardless of which side of the
        // consulted/awaiting split it's currently on.
        return fetchPatient(patientIdParam)
          .then((patient) => setPatients([patient]))
          .catch(() => setPatients([]))
          .finally(() => setLoading(false));
      }
      // A search runs across every patient rather than the open tab. Whoever
      // is being looked for is as likely to be waiting in Appointments as to
      // have been seen, and a name that exists returning "no patients" is
      // indistinguishable from the record having been lost.
      return Promise.all([
        fetchPatients(searching ? "all" : scope, searching ? query : undefined),
        fetchPatientCounts(),
      ])
        .then(([rows, totals]) => {
          setPatients(rows);
          setCounts(totals);
        })
        .finally(() => setLoading(false));
    },
    [scope, searching, query, patientIdParam]
  );

  // The doctor list backs both the registration form and the re-route picker;
  // nobody who can do neither needs to pay for the request.
  const needsDoctors = canRegister || canReroute;

  useEffect(() => {
    if (!needsDoctors) return;
    fetchDoctors().then(setDoctors).catch(() => setDoctors([]));
  }, [needsDoctors]);

  useEffect(() => {
    load();
  }, [load]);

  // Typing moves the URL, debounced — one request per pause rather than one
  // per keystroke, and `replace` so a search does not bury the previous page
  // under a history entry per character.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === searchTerm) return;
    const id = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (next) params.set("search", next);
      else params.delete("search");
      params.delete("patient_id");
      setSearchParams(params, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput, searchTerm, searchParams, setSearchParams]);

  // Front desk registering a patient should show up here immediately.
  useLiveRefresh(load);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await deletePatient(deleteTarget.id);
      // Dropped from the table straight away, then the counts and the rest of
      // the list are refetched so nothing on screen is left stale.
      setPatients((rows) => rows.filter((p) => p.id !== deleteTarget.id));
      setSuccessMsg(`${deleteTarget.name} was deleted.`);
      setDeleteTarget(null);
      load(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not delete this patient.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Patients</h1>
          {patientIdParam && (
            <button
              onClick={clearPatientIdParam}
              className="mt-1 text-sm font-semibold text-brand-600 underline underline-offset-2"
            >
              ← Back to all patients
            </button>
          )}
        </div>
        {canRegister && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlinePlus className="h-4 w-4" />
            ADD OP
          </button>
        )}
      </div>

      {/* Name, patient code (PAT0004), phone or email. The server does the
          matching so it reaches every patient the caller may see, not just the
          page already loaded. */}
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 sm:max-w-md">
        <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search patients"
          placeholder="Search by name, patient ID, phone or email…"
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        )}
      </div>

      {searchInput.trim().length === 1 && (
        <p className="mt-2 text-xs text-slate-400">
          Keep typing — at least {MIN_SEARCH_LENGTH} characters.
        </p>
      )}

      {/* A patient sits on exactly one side: in Appointments until their
          consultation is finished, here afterwards. The tabs make that
          visible rather than leaving the other half looking missing.

          Hidden while searching: the search deliberately crosses both sides,
          so a tab claiming to be the active filter would be a lie — and a
          match on the other side would look like no match at all. */}
      {!isDoctor && (
        <div className={`mt-5 flex-wrap gap-2 ${searching || patientIdParam ? "hidden" : "flex"}`}>
          {[
            ["consulted", "Consulted", counts?.consulted],
            ["awaiting", "Awaiting consultation", counts?.awaiting],
          ].map(([value, label, count]) => (
            <button
              key={value}
              onClick={() => setScope(value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                scope === value
                  ? "bg-brand-600 text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
              {count != null && (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                    scope === value ? "bg-white/20" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!isDoctor && scope === "awaiting" && !searching && !patientIdParam && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These patients are still with Appointments. They move to Consulted once the doctor
          completes their consultation.
          <button
            onClick={() => navigate("/dashboard/appointments")}
            className="font-semibold underline underline-offset-2"
          >
            Open Appointments
          </button>
        </p>
      )}

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}
      {successMsg && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
        >
          <HiOutlineCheckBadge className="h-5 w-5 shrink-0" />
          {successMsg}
        </p>
      )}

      <div className="mt-5">
        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : patients.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <p className="mx-auto max-w-lg text-sm text-slate-400">
              {searching ? (
                <>
                  No patient matches “{query}”. Names, patient IDs, phone
                  numbers and email addresses are all searched.
                  <button
                    onClick={() => setSearchInput("")}
                    className="ml-1 font-semibold text-brand-600 underline underline-offset-2"
                  >
                    Clear the search
                  </button>
                </>
              ) : patientIdParam ? (
                <>
                  This patient could not be found, or you don&apos;t have access to their record.
                  <button
                    onClick={clearPatientIdParam}
                    className="ml-1 font-semibold text-brand-600 underline underline-offset-2"
                  >
                    View all patients
                  </button>
                </>
              ) : scope === "consulted" ? (
                counts?.awaiting ? (
                  `No completed consultations yet. ${counts.awaiting} patient${
                    counts.awaiting === 1 ? " is" : "s are"
                  } still in Appointments — they appear here once their consultation is done.`
                ) : (
                  "No patients have completed a consultation yet."
                )
              ) : (
                "Nobody is waiting. Every registered patient has been consulted."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((p) => (
              <PatientCard
                key={p.id}
                patient={p}
                doctors={doctors}
                canReassignDoctor={canReroute}
                canAssignNurse={canAssignNurse}
                canEditPatient={canEditPatient}
                canDeletePatient={canDeletePatient}
                onAssignNurse={() => setNursePatient(p)}
                onEdit={() => setEditPatient(p)}
                onDelete={() => {
                  setErrorMsg("");
                  setSuccessMsg("");
                  setDeleteTarget(p);
                }}
                onAssignDoctor={async (patientId, doctorId) => {
                  await assignPatientDoctor(patientId, doctorId);
                  load(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && canRegister && (
        <AddOpModal
          doctors={doctors}
          onClose={() => setShowAddModal(false)}
          onCreated={(created) => {
            setShowAddModal(false);
            // Registering also raised the patient's OP, so say which queue they
            // went into. Without it the desk has no confirmation that the half
            // of the action they can't see from this page actually happened,
            // and the habit of going to Appointments to "finish the job" — the
            // step this change removes — is exactly what would persist.
            const department = created?.appointment?.department;
            setSuccessMsg(
              department
                ? `${created.name} registered and added to the ${department} queue.`
                : `${created?.name || "Patient"} registered.`
            );
            // A patient who has just been registered has no completed
            // consultation, so they belong to Awaiting. Switching to that tab
            // means the person who registered them sees them, instead of
            // watching them apparently not save. The scope change reloads.
            if (scope === "awaiting") load();
            else setScope("awaiting");
          }}
        />
      )}

      {editPatient && (
        <EditPatientModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={() => {
            setEditPatient(null);
            load(true);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete patient"
          message={
            `Are you sure you want to delete this patient record?\n\n` +
            `${deleteTarget.name} (${deleteTarget.code}) will be removed permanently, ` +
            "along with any appointment they are queued for. This cannot be undone."
          }
          confirmLabel="Delete patient"
          cancelLabel="Cancel"
          destructive
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {nursePatient && (
        <AssignNurseModal
          patientId={nursePatient.id}
          patientName={nursePatient.name}
          observationDays={nursePatient.observation_days}
          onClose={() => setNursePatient(null)}
          onAssigned={(assignment) => {
            setNursePatient(null);
            navigate(`/dashboard/nursing/${assignment.id}`);
          }}
        />
      )}
    </div>
  );
}
