import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineCalendarDays,
  HiOutlineClipboardDocumentList,
  HiOutlineExclamationTriangle,
  HiOutlinePencilSquare,
  HiOutlinePlayCircle,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import BookAppointmentModal from "../components/BookAppointmentModal";
import PatientFormModal from "../components/PatientFormModal";
import StatusBadge from "../components/StatusBadge";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { useAuth } from "../context/AuthContext";
import { fetchAppointmentHistory, fetchQueue } from "../services/appointmentService";
import { startConsultation } from "../services/consultationService";
import { fetchPatient, updatePatient } from "../services/patientService";
import { fetchPrescriptions } from "../services/prescriptionService";
import { canEditPatient, canManageAppointments, canRunConsultation } from "../utils/permissions";

function when(iso, fallback = "—") {
  if (!iso) return fallback;
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A `YYYY-MM-DD` date of birth, formatted without going through `Date` —
 *  a date-only string parses as UTC midnight, which `toLocaleString` can push
 *  back a day in any timezone west of it. */
function formatDob(iso) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const label = MONTHS[Number(month) - 1];
  return label ? `${Number(day)} ${label} ${year}` : iso;
}

function Section({ title, icon: Icon, count, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {Icon && <Icon className="h-4.5 w-4.5 text-slate-400" />}
          {title}
          {count != null && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="py-6 text-center text-xs text-slate-400">{children}</p>;
}

/**
 * One patient's record: who they are, what is happening with them now, and
 * what they are taking.
 *
 * Deliberately not everything known about them. Their consultations, their
 * appointments and their reports each have a screen of their own, and a page
 * that repeated all three in a sidebar was answering questions nobody had
 * arrived here to ask. Both roles open the same page; what differs is the
 * buttons — Start consultation is the doctor's, Book and Edit are the desk's.
 *
 * Some of what is loaded is never drawn, and is meant to be: the queue entry
 * and the appointment history are what tell this page whether the patient
 * already has a session today, which decides what its main button does. See
 * `todaysSession`.
 *
 * Everything is loaded against **this patient's id**, and every list is
 * filtered by it before it is drawn. That is not incidental: a record page
 * that shows one patient's identity above another patient's prescriptions is
 * worse than one that shows nothing, so the filter is applied here as well as
 * being asked for from the server.
 */
export default function PatientDetails() {
  const { patientId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [queueEntry, setQueueEntry] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);

  const id = Number(patientId);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      try {
        const [record, history, queue, scripts] = await Promise.all([
          fetchPatient(id),
          fetchAppointmentHistory({ patient_id: id, page_size: 50 }),
          fetchQueue().catch(() => []),
          fetchPrescriptions({ patient_id: id }).catch(() => ({ items: [] })),
        ]);

        setPatient(record);
        // Neither of these is drawn. Between them they say whether this
        // patient already has a session today, and in which state — see
        // `todaysSession`.
        setAppointments(history.items || []);
        setQueueEntry((queue || []).find((a) => a.patient_id === id) || null);

        // Filtered again here even though the server was asked for this
        // patient: a prescription shown under the wrong record is the exact
        // failure this page must not have.
        setPrescriptions(
          (scripts.items || []).filter((entry) => entry.patient?.id === id)
        );
        setErrorMsg("");
      } catch (err) {
        setErrorMsg(
          err.response?.status === 404
            ? "That patient could not be found."
            : err.response?.data?.message || "Could not load this patient."
        );
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load);

  // Today's session for this patient, if there is one — the whole of what the
  // button under their name needs to know.
  //
  // `POST /consultations` opens a *new* session and refuses while this patient
  // already has one today, in either state: still recording ("Session 1 is
  // still in progress") or finished ("You already saw this patient today").
  // Both refusals are right — a visit is one session, with one summary and one
  // prescription — but the button was sending every press through that route,
  // so the doctor was told to go back to a session the page gave them no way
  // back to.
  //
  // The two states are found in different places, because a session leaves the
  // queue when it ends: an open one is on today's queue entry, and a finished
  // one is on the patient's own history. Either way what the doctor wants is
  // the same session, so the button opens it rather than asking for a new one.
  const running = queueEntry?.consultation_id || null;
  const finishedToday =
    appointments.find((a) => a.consultation?.is_from_today)?.consultation || null;
  const todaysSession = running || finishedToday?.id || null;

  /** The button under the patient's name — see `todaysSession` above for the
   *  two things it can mean.
   *
   *  Opening today's session is a navigation, not a POST: it already exists,
   *  and the consulting room is where both of the things the doctor might
   *  want next live — carrying on with the recording, or adding to a visit
   *  they have just ended. Only a patient with no session today starts one. */
  async function handleStart() {
    if (todaysSession) {
      navigate(`/dashboard/consultations/${todaysSession}`);
      return;
    }
    setStarting(true);
    setErrorMsg("");
    try {
      const consultation = await startConsultation(id);
      navigate(`/dashboard/consultations/${consultation.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not start a consultation.");
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-slate-600">{errorMsg || "Patient not found"}</p>
        <Link
          to="/dashboard/patients"
          className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          ← Back to patients
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        to="/dashboard/patients"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <HiOutlineArrowLeft className="h-4 w-4" />
        Patients
      </Link>

      {errorMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {/* --- Identity ---------------------------------------------------- */}
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={patient.name} imageUrl={patient.photo_url} size="xl" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{patient.name}</h1>
              {queueEntry && (
                <StatusBadge status={queueEntry.status} label={queueEntry.status_label} />
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-400">
              {[
                patient.code,
                patient.age != null ? `${patient.age} years` : null,
                // Beside the age rather than in a row of its own: they are the
                // same fact stated two ways, and the exact one is what settles
                // which of two patients with the same name you have open.
                patient.dob ? `born ${formatDob(patient.dob)}` : null,
                patient.gender,
                patient.blood_group,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {[patient.phone, patient.email].filter(Boolean).join(" · ") ||
                "No contact details on file"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canRunConsultation(user?.role) && (
              <button
                onClick={handleStart}
                disabled={starting}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                <HiOutlinePlayCircle className="h-4.5 w-4.5" />
                {starting
                  ? "Opening…"
                  : running
                    ? "Resume consultation"
                    : finishedToday
                      ? "Continue today's consultation"
                      : "Start consultation"}
              </button>
            )}
            {canManageAppointments(user?.role) && (
              <button
                onClick={() => setBooking(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                <HiOutlineCalendarDays className="h-4.5 w-4.5" />
                Book
              </button>
            )}
            {canEditPatient(user?.role) && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <HiOutlinePencilSquare className="h-4.5 w-4.5" />
                Edit
              </button>
            )}
          </div>
        </div>

        {patient.allergies && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3">
            <HiOutlineExclamationTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Allergies: </span>
              {patient.allergies}
            </p>
          </div>
        )}
      </section>

      {/* --- Prescriptions ------------------------------------------------
          The only history this page draws. Consultations have their own list
          and their own room, appointments have the queue and the book, and a
          report is downloaded from where it was issued — but what a patient
          is taking is the question asked about them rather than about a
          visit, so it is answered on the patient. */}
      <Section
        title="Prescriptions"
        icon={HiOutlineClipboardDocumentList}
        count={prescriptions.length}
      >
        {prescriptions.length === 0 ? (
          <Empty>Nothing has been prescribed yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {prescriptions.map((entry) => (
              <li key={entry.consultation_id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {when(entry.consulted_at)}
                  </p>
                  {entry.verified ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      Signed by {entry.verified_by || "the doctor"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      Awaiting sign-off
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {(entry.medicines || []).map((line) => (
                    <li key={line.id} className="text-sm text-slate-600">
                      <span className="font-medium text-slate-700">{line.medicine_name}</span>
                      {[line.dose, line.frequency, line.duration]
                        .filter(Boolean)
                        .map((part) => ` · ${part}`)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing && (
        <PatientFormModal
          patient={patient}
          onClose={() => setEditing(false)}
          onSave={async (payload) => {
            await updatePatient(id, payload);
            load(true);
          }}
        />
      )}

      {booking && (
        <BookAppointmentModal
          patient={patient}
          onClose={() => setBooking(false)}
          onBooked={() => load(true)}
        />
      )}
    </div>
  );
}
