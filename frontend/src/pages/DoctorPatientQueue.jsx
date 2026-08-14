import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineMagnifyingGlass,
  HiOutlineUserGroup,
} from "react-icons/hi2";
import AppointmentCard from "../components/AppointmentCard";
import { EmptyState, PageHeader, RecordGridSkeleton } from "../components/RecordCard";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchAppointments } from "../services/appointmentService";
import { fetchDoctors } from "../services/doctorService";
import { bucketFor, buildQueueEntries, groupByDoctor } from "../utils/queue";
import { matchesSearch } from "../utils/search";

/**
 * One doctor's patient queue, on its own page.
 *
 * Reached from that doctor's card on Appointments. A page rather than a panel
 * underneath the cards: the queue is what reception came to read, and the
 * doctor id in the URL means it survives a refresh and can be linked to or
 * kept open on a second tab per doctor.
 */
export default function DoctorPatientQueue() {
  const { doctorId } = useParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [doctorMissing, setDoctorMissing] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [patientSearch, setPatientSearch] = useState("");

  // The id comes off the URL as a string; every doctor id it is compared
  // against is a number.
  const id = Number(doctorId);

  // No single-doctor endpoint, and the directory is short — the name in the
  // heading is the only thing this is for, so the queue below renders as soon
  // as the appointments land rather than waiting on it.
  useEffect(() => {
    let cancelled = false;
    fetchDoctors()
      .then((doctors) => {
        if (cancelled) return;
        const match = doctors.find((d) => d.id === id) || null;
        setDoctor(match);
        setDoctorMissing(!match);
      })
      .catch(() => {
        if (!cancelled) setDoctor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // `silent` skips the skeleton: a live refresh should update the queue in
  // place, not blank it out while somebody is looking at it.
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return fetchAppointments()
      .then((rows) => {
        setAppointments(rows);
        setErrorMsg("");
      })
      .catch(() => setErrorMsg("Could not load this doctor's queue."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A patient being called in or finishing changes this queue.
  useLiveRefresh(load);

  const entries = useMemo(() => {
    const bucket = bucketFor(groupByDoctor(appointments), id);
    return buildQueueEntries(bucket.current, bucket.waiting).entries;
  }, [appointments, id]);

  // Filtered here rather than through the API: this is one doctor's queue,
  // already loaded and never long. The rule is the server's all the same
  // (utils/search.js) — partial, case-insensitive, and every word narrowing —
  // so "kum" finds Ravi Kumar here exactly as it does on the Patients page.
  const visibleEntries = entries.filter(({ appointment }) =>
    matchesSearch(patientSearch, [
      appointment.patient,
      appointment.patient_detail?.code,
      appointment.patient_detail?.phone,
    ])
  );

  function openPatient(appointment) {
    navigate(`/dashboard/appointments/patients/${appointment.patient_id}`, {
      // So the patient's own page can send you back to this queue rather than
      // to Appointments, which is a step further out than you came from.
      state: {
        from: `/dashboard/appointments/doctors/${id}`,
        fromLabel: "Back to patient queue",
      },
    });
  }

  return (
    <div>
      <Link
        to="/dashboard/appointments"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
      >
        <HiOutlineArrowLeft className="h-4 w-4" />
        Back to Appointments
      </Link>

      <div className="mt-3">
        <PageHeader
          icon={HiOutlineUserGroup}
          title={doctor ? `${doctor.name} — Patient Queue` : "Patient Queue"}
          description={
            doctor
              ? [doctor.department, doctor.specialization].filter(Boolean).join(" · ") || undefined
              : undefined
          }
        />
      </div>

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {doctorMissing && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No doctor with this ID. They may have been removed from the directory.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 sm:max-w-md">
        <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={patientSearch}
          onChange={(e) => setPatientSearch(e.target.value)}
          aria-label="Search this doctor's queue"
          placeholder="Search by patient name or ID…"
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      </div>

      <div className="mt-5">
        {loading ? (
          <RecordGridSkeleton count={3} />
        ) : entries.length === 0 ? (
          <EmptyState icon={HiOutlineUserGroup}>
            Nobody in this doctor&apos;s queue right now.
          </EmptyState>
        ) : visibleEntries.length === 0 ? (
          <EmptyState icon={HiOutlineUserGroup}>
            No patient in this queue matches “{patientSearch.trim()}”.
          </EmptyState>
        ) : (
          // Same card the flat queue uses, one per patient, in this doctor's
          // own queue order — just re-numbered per doctor instead of the
          // appointment's global position. Nobody consults from here
          // (canConsult is always false for this page), so every card falls
          // back to its plain status label rather than offering Start/Resume.
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleEntries.map(({ appointment, queueNumber, isNext }) => (
              <AppointmentCard
                key={appointment.id}
                appointment={{ ...appointment, queue_number: queueNumber }}
                isNext={isNext}
                canConsult={false}
                onStart={() => {}}
                onResume={() => {}}
                onViewDetails={openPatient}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
