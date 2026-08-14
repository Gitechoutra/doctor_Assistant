import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { HiOutlineArrowLeft, HiOutlineCalendarDays } from "react-icons/hi2";
import Avatar from "../components/Avatar";
import SurgeryStageBadge from "../components/SurgeryStageBadge";
import { Badge } from "../components/RecordCard";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchAppointments } from "../services/appointmentService";
import { fetchPatient } from "../services/patientService";

const APPOINTMENTS_PATH = "/dashboard/appointments";

const OP_STATUS_META = {
  paid: { label: "OP paid", tone: "emerald" },
  free: { label: "Follow-up (free)", tone: "brand" },
};

const APPOINTMENT_STATUS_META = {
  in_progress: { label: "In consultation", tone: "emeraldSolid" },
  waiting: { label: "Pending consultation", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "amber" },
};

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : null;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : null;
}

/** A label over its value. Long free text (history, allergies) keeps its own
 *  line breaks rather than collapsing into one paragraph. */
function Fact({ label, value, wrap = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`mt-0.5 text-sm font-medium text-slate-700 ${
          wrap ? "whitespace-pre-line" : "truncate"
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

/**
 * One patient's full record, on its own page.
 *
 * Reached from a doctor's patient queue, and keyed by the patient id in the
 * URL — so the page is bookmarkable, survives a refresh, and always shows the
 * patient that was clicked rather than whatever the list happened to be
 * holding. Read-only: registration details are corrected from the Patients
 * page, and the clinical record belongs to the consultation room.
 */
export default function PatientDetails() {
  const { patientId } = useParams();
  const { state } = useLocation();

  // Set when you arrived from a doctor's queue, so Back returns you there
  // instead of skipping out to Appointments. A direct visit (bookmark, typed
  // URL, refresh into a fresh history entry) has no state and falls back.
  const backTo = state?.from || APPOINTMENTS_PATH;
  const backLabel = state?.fromLabel || "Back to Appointments";

  const [patient, setPatient] = useState(null);
  const [openOp, setOpenOp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return Promise.all([
        fetchPatient(patientId),
        // The OP they are queued for, if any. Only the open ones come back
        // from this endpoint, so a patient with nothing pending simply has
        // no match — which is what the card below says.
        fetchAppointments().catch(() => []),
      ])
        .then(([record, appointments]) => {
          setPatient(record);
          setOpenOp(appointments.find((a) => a.patient_id === record.id) || null);
          setErrorMsg("");
        })
        .catch(() =>
          setErrorMsg("This patient could not be found, or you don't have access to their record.")
        )
        .finally(() => setLoading(false));
    },
    [patientId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Their OP moving, or the front desk correcting a detail, changes this page.
  useLiveRefresh(load);

  const backLink = (
    <Link
      to={backTo}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
    >
      <HiOutlineArrowLeft className="h-4 w-4" />
      {backLabel}
    </Link>
  );

  if (loading) {
    return (
      <div>
        {backLink}
        <div className="mt-4 h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div>
        {backLink}
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMsg || "Patient not found."}
        </p>
      </div>
    );
  }

  const opStatus = OP_STATUS_META[patient.op_status];
  const opAppointmentStatus = openOp && (APPOINTMENT_STATUS_META[openOp.status] || {
    label: openOp.status.replace("_", " "),
    tone: "slate",
  });

  return (
    <div>
      {backLink}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={patient.name} imageUrl={patient.photo_url} size="xl" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">
              {patient.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {patient.code}
              {patient.age != null && ` · ${patient.age} yrs`}
              {patient.gender && ` · ${patient.gender}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {opStatus && <Badge tone={opStatus.tone}>{opStatus.label}</Badge>}
              <SurgeryStageBadge
                stage={patient.surgery_stage}
                daysLeft={patient.observation_days_left}
              />
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Personal details">
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Patient ID" value={patient.code} />
              <Fact label="Age" value={patient.age != null ? `${patient.age} yrs` : null} />
              <Fact label="Gender" value={patient.gender} />
              <Fact label="Date of birth" value={formatDate(patient.dob)} />
              <Fact label="Phone" value={patient.phone} />
              <Fact label="Email" value={patient.email} />
              <Fact label="Blood group" value={patient.blood_group} />
              <Fact
                label="Registered"
                value={formatDateTime(patient.last_registered_at)}
              />
            </div>
          </Section>

          <Section title="Medical record">
            <div className="mt-3 space-y-4">
              <Fact label="Allergies" value={patient.allergies} wrap />
              <Fact label="Medical history" value={patient.medical_history} wrap />
            </div>
          </Section>

          {/* The surgical pathway, only for a patient who is on it — a null
              stage is the ordinary case and would otherwise be a card of
              dashes. Same rule SurgeryStageBadge follows. */}
          {patient.is_surgical && (
            <Section title="Surgical pathway">
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Stage" value={patient.surgery_stage?.replace(/_/g, " ")} />
                <Fact label="Marked" value={formatDateTime(patient.surgery_marked_at)} />
                <Fact label="Operated" value={formatDateTime(patient.surgery_completed_at)} />
                <Fact
                  label="Observation"
                  value={
                    patient.observation_days != null ? `${patient.observation_days} days` : null
                  }
                />
                <Fact label="Watch ends" value={formatDateTime(patient.observation_ends_at)} />
                <Fact
                  label="Days left"
                  value={
                    patient.observation_days_left != null
                      ? `${patient.observation_days_left}`
                      : null
                  }
                />
              </div>
              {patient.surgery_notes && (
                <div className="mt-4">
                  <Fact label="Surgery notes" value={patient.surgery_notes} wrap />
                </div>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-5">
          <Section title="Assigned doctor">
            {patient.assigned_doctor ? (
              <div className="mt-3 space-y-3">
                <Fact label="Doctor" value={patient.assigned_doctor.name} />
                <Fact label="Department" value={patient.assigned_doctor.department} />
                <Fact label="Specialization" value={patient.assigned_doctor.specialization} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-amber-700">
                Nobody is assigned yet. Route this patient to a doctor from the Patients page.
              </p>
            )}
          </Section>

          <Section title="Current OP">
            {openOp ? (
              <div className="mt-3 space-y-3">
                <Badge tone={opAppointmentStatus.tone}>{opAppointmentStatus.label}</Badge>
                <Fact label="OP" value={openOp.code} />
                <Fact label="Department" value={openOp.department} />
                <Fact label="Reason" value={openOp.reason} wrap />
                <Fact label="Raised" value={formatDateTime(openOp.created_at)} />
                <Link
                  to={APPOINTMENTS_PATH}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 underline underline-offset-2"
                >
                  <HiOutlineCalendarDays className="h-4 w-4" />
                  Open Appointments
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                No OP open for this patient right now.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
