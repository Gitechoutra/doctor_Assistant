import { Link, useNavigate } from "react-router-dom";
import {
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineQueueList,
  HiOutlineUserPlus,
  HiOutlineUsers,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import QueueBoard from "../components/QueueBoard";
import StatCard from "../components/StatCard";
import useLiveSummary from "../hooks/useLiveSummary";
import { useAuth } from "../context/AuthContext";
import { startAppointment } from "../services/appointmentService";
import { useState } from "react";

/** "20 Aug, 10:30" — enough to place an appointment without the year, which
 *  is noise for anything inside the booking window. */
function whenLabel(iso) {
  if (!iso) return "No time set";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ children }) {
  return <p className="py-6 text-center text-xs text-slate-400">{children}</p>;
}

/**
 * The home screen for both roles.
 *
 * One page, because both people are working the same day — the PA from the
 * front of it and the doctor from the consulting room. The numbers along the
 * top are deliberately the same four for each (who is booked, who is here,
 * who is with the doctor, who has been seen): a shared count is what lets the
 * two of them talk to each other about the day without checking whose screen
 * is right. Underneath, each gets what only they act on.
 */
export default function Dashboard() {
  const { user, isDoctor } = useAuth();
  const { summary, loading, errorMsg, refresh } = useLiveSummary();
  const navigate = useNavigate();
  const [startingId, setStartingId] = useState(null);

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  const data = summary || {};
  const queue = data.queue || [];
  const firstName = (user?.name || "").replace(/^Dr\.?\s*/i, "").split(" ")[0];

  async function handleStart(appointment) {
    setStartingId(appointment.id);
    try {
      const consultation = await startAppointment(appointment.id);
      navigate(`/dashboard/consultations/${consultation.id}`);
    } catch {
      refresh();
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Registering a patient is done from Patients, where the list you are
          about to add to is. The dashboard is what the day looks like. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Good day{firstName ? `, ${isDoctor ? "Dr. " : ""}${firstName}` : ""}
          </h1>
        </div>
      </header>

      {errorMsg && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{errorMsg}</p>
      )}

      {/* The same four numbers for both, so the desk and the room agree. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="In the queue today"
          value={data.todays_appointments}
          hint="Patients here now, waiting or being seen"
          icon={HiOutlineQueueList}
          to="/dashboard/queue"
        />
        <StatCard
          label="Waiting"
          value={data.waiting}
          hint="Checked in, not yet called"
          icon={HiOutlineClock}
          to="/dashboard/queue"
        />
        <StatCard
          label="In consultation"
          value={data.in_consultation}
          hint="With the doctor right now"
          icon={HiOutlineChatBubbleLeftRight}
          to="/dashboard/queue"
        />
        <StatCard
          label="Completed today"
          value={data.todays_completed}
          hint="Consultations finished today"
          icon={HiOutlineCheckCircle}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            title="Patient queue"
            action={
              <Link
                to="/dashboard/queue"
                className="text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                Open queue →
              </Link>
            }
          >
            <QueueBoard
              queue={queue}
              onStart={isDoctor ? handleStart : undefined}
              startingId={startingId}
              emptyMessage={
                isDoctor
                  ? "Nobody is waiting. Patients appear here as the PA checks them in."
                  : "Nobody is waiting. Book a walk-in from Appointments."
              }
            />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel
            title="Upcoming appointments"
            action={
              !isDoctor && (
                <Link
                  to="/dashboard/appointments"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  Manage →
                </Link>
              )
            }
          >
            {(data.upcoming || []).length === 0 ? (
              <EmptyLine>Nothing booked ahead.</EmptyLine>
            ) : (
              <ul className="space-y-3">
                {data.upcoming.map((appointment) => (
                  <li key={appointment.id} className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                      <HiOutlineCalendarDays className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/dashboard/patients/${appointment.patient_id}`}
                        className="block truncate text-sm font-medium text-slate-700 hover:text-brand-700"
                      >
                        {appointment.patient}
                      </Link>
                      <p className="truncate text-xs text-slate-400">
                        {whenLabel(appointment.scheduled_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {isDoctor ? (
            <>
              {/* Reports came off the menu, and its stat card went with it —
                  a tile is a way in, and leaving one behind would have put
                  the section back on screen by another door. */}
              <StatCard
                label="Prescriptions to sign"
                value={data.pending_prescriptions}
                hint="Finished visits awaiting sign-off"
                icon={HiOutlineClipboardDocumentList}
                to="/dashboard/consultations"
              />

              <Panel
                title="Recent consultations"
                action={
                  <Link
                    to="/dashboard/consultations"
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    All →
                  </Link>
                }
              >
                {(data.recent_consultations || []).length === 0 ? (
                  <EmptyLine>No consultations recorded yet.</EmptyLine>
                ) : (
                  <ul className="space-y-3">
                    {data.recent_consultations.slice(0, 5).map((consultation) => (
                      <li key={consultation.id}>
                        <Link
                          to={`/dashboard/consultations/${consultation.id}`}
                          className="flex items-center gap-3 rounded-lg p-1 transition hover:bg-slate-50"
                        >
                          <Avatar name={consultation.patient} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-700">
                              {consultation.patient}
                            </p>
                            <p className="truncate text-xs text-slate-400">
                              {consultation.status === "in_progress"
                                ? "In progress"
                                : whenLabel(consultation.ended_at || consultation.started_at)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label="Total patients"
                  value={data.total_patients}
                  hint="On the practice's books"
                  icon={HiOutlineUsers}
                  to="/dashboard/patients"
                />
                <StatCard
                  label="Registered today"
                  value={data.todays_registrations}
                  hint="New patients added today"
                  icon={HiOutlineUserPlus}
                  to="/dashboard/patients"
                />
              </div>

              <Panel
                title="Recently registered"
                action={
                  <Link
                    to="/dashboard/patients"
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    All →
                  </Link>
                }
              >
                {(data.recent_patients || []).length === 0 ? (
                  <EmptyLine>No patients registered yet.</EmptyLine>
                ) : (
                  <ul className="space-y-3">
                    {data.recent_patients.slice(0, 5).map((patient) => (
                      <li key={patient.id}>
                        <Link
                          to={`/dashboard/patients/${patient.id}`}
                          className="flex items-center gap-3 rounded-lg p-1 transition hover:bg-slate-50"
                        >
                          <Avatar name={patient.name} imageUrl={patient.photo_url} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-700">
                              {patient.name}
                            </p>
                            <p className="truncate text-xs text-slate-400">
                              {[patient.code, patient.phone].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
