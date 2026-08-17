import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowDownTray,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentChartBar,
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
import { downloadReport, fetchReports } from "../services/reportService";
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

function Detail({ label, value, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{value || "—"}</p>
    </div>
  );
}

/**
 * One patient's whole record, in the order somebody actually reads it.
 *
 * Identity, then what is currently happening, then the history — appointments,
 * consultations, prescriptions, reports. Both roles open the same page: the
 * PA needs every section to answer the phone ("is her report ready?", "what
 * was he given last time?"), and the doctor needs them to know who they are
 * about to see. What differs is the buttons — Start consultation is the
 * doctor's, Book and Edit are the desk's.
 *
 * Everything is loaded against **this patient's id**, and every list is
 * filtered by it before it is drawn. That is not incidental: a record page
 * that shows one patient's identity above another patient's reports is worse
 * than one that shows nothing, so the filter is applied here as well as being
 * asked for from the server.
 */
export default function PatientDetails() {
  const { patientId } = useParams();
  const { user, isDoctor } = useAuth();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [queueEntry, setQueueEntry] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [reports, setReports] = useState([]);
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
        const [record, history, queue, scripts, allReports] = await Promise.all([
          fetchPatient(id),
          fetchAppointmentHistory({ patient_id: id, page_size: 50 }),
          fetchQueue().catch(() => []),
          fetchPrescriptions({ patient_id: id }).catch(() => ({ items: [] })),
          fetchReports().catch(() => []),
        ]);

        setPatient(record);
        setAppointments(history.items || []);
        setQueueEntry((queue || []).find((a) => a.patient_id === id) || null);

        // Filtered again here even though the server was asked for this
        // patient: `/reports` has no patient filter of its own, and a report
        // shown under the wrong record is the exact failure this page must
        // not have.
        setPrescriptions(
          (scripts.items || []).filter((entry) => entry.patient?.id === id)
        );
        setReports((allReports || []).filter((report) => report.patient_id === id));
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

  const consultations = appointments.filter((a) => a.consultation);

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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* --- Consultation history --------------------------------- */}
          <Section
            title="Consultation history"
            icon={HiOutlineChatBubbleLeftRight}
            count={consultations.length}
          >
            {consultations.length === 0 ? (
              <Empty>No consultations recorded yet.</Empty>
            ) : (
              <ul className="space-y-3">
                {consultations.map((appointment) => {
                  const consultation = appointment.consultation;
                  const summary = consultation.summary;
                  const inner = (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          {when(consultation.ended_at || consultation.started_at)}
                        </p>
                        <span className="text-xs text-slate-400">
                          {consultation.session_number
                            ? `Session ${consultation.session_number}`
                            : appointment.code}
                        </span>
                      </div>
                      {summary?.possible_diagnosis && (
                        <p className="mt-1.5 text-sm text-slate-600">
                          <span className="font-semibold">Diagnosis: </span>
                          {summary.possible_diagnosis}
                        </p>
                      )}
                      {summary?.symptoms && (
                        <p className="mt-1 text-xs text-slate-500">{summary.symptoms}</p>
                      )}
                      {(consultation.prescriptions || []).length > 0 && (
                        <p className="mt-2 text-xs text-slate-500">
                          <span className="font-semibold">Prescribed: </span>
                          {consultation.prescriptions
                            .map((line) => line.medicine_name)
                            .join(", ")}
                        </p>
                      )}
                    </>
                  );

                  return (
                    <li
                      key={appointment.id}
                      className="rounded-xl border border-slate-100 p-4 transition hover:border-slate-200"
                    >
                      {isDoctor ? (
                        <Link
                          to={`/dashboard/consultations/${consultation.id}`}
                          className="block"
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* --- Prescriptions ----------------------------------------- */}
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
                  <li
                    key={entry.consultation_id}
                    className="rounded-xl border border-slate-100 p-4"
                  >
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
                          <span className="font-medium text-slate-700">
                            {line.medicine_name}
                          </span>
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
        </div>

        <div className="space-y-5">
          {/* --- Clinical background ---------------------------------- */}
          <Section title="Patient information">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail label="Date of birth" value={patient.dob ? formatDob(patient.dob) : null} />
              <Detail label="Phone" value={patient.phone} />
              <Detail label="Existing conditions" value={patient.existing_conditions} wide />
              <Detail label="Medical history" value={patient.medical_history} wide />
              <Detail label="Address" value={patient.address} wide />
              <Detail label="Emergency contact" value={patient.emergency_contact_name} />
              <Detail label="Contact number" value={patient.emergency_contact_phone} />
              <Detail label="Notes" value={patient.notes} wide />
              <Detail label="Registered" value={when(patient.created_at)} wide />
            </div>
          </Section>

          {/* --- Appointments ----------------------------------------- */}
          <Section
            title="Appointments"
            icon={HiOutlineCalendarDays}
            count={appointments.length}
          >
            {appointments.length === 0 && !queueEntry ? (
              <Empty>No appointments yet.</Empty>
            ) : (
              <ul className="space-y-2">
                {queueEntry && (
                  <li className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2">
                    <span className="text-xs font-medium text-brand-800">
                      {when(queueEntry.arrived_at, "Today")}
                    </span>
                    <StatusBadge
                      status={queueEntry.status}
                      label={queueEntry.status_label}
                    />
                  </li>
                )}
                {appointments.slice(0, 8).map((appointment) => (
                  <li
                    key={appointment.id}
                    className="flex items-center justify-between gap-2 px-1"
                  >
                    <span className="truncate text-xs text-slate-500">
                      {when(appointment.scheduled_at || appointment.arrived_at)}
                    </span>
                    <StatusBadge
                      status={appointment.status}
                      label={appointment.status_label}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* --- Reports ---------------------------------------------- */}
          <Section
            title="Reports"
            icon={HiOutlineDocumentChartBar}
            count={reports.length}
          >
            {reports.length === 0 ? (
              <Empty>No reports issued for this patient.</Empty>
            ) : (
              <ul className="space-y-2">
                {reports.map((report) => (
                  <li
                    key={report.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5"
                  >
                    <span className="truncate text-xs text-slate-500">
                      {when(report.generated_at)}
                    </span>
                    <button
                      onClick={() =>
                        downloadReport(
                          report.id,
                          `${patient.name.replace(/\s+/g, "_")}_report.pdf`
                        )
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                      <HiOutlineArrowDownTray className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

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
