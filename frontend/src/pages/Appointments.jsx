import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlinePencilSquare,
  HiOutlinePrinter,
  HiOutlineXCircle,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import BookAppointmentModal from "../components/BookAppointmentModal";
import ConfirmDialog from "../components/ConfirmDialog";
import QueueBoard from "../components/QueueBoard";
import SearchInput from "../components/SearchInput";
import StatusBadge from "../components/StatusBadge";
import useDebouncedValue from "../hooks/useDebouncedValue";
import useLiveRefresh from "../hooks/useLiveRefresh";
import {
  cancelAppointment,
  checkInAppointment,
  fetchAppointmentHistory,
  fetchQueue,
  fetchUpcoming,
  generateAppointmentSlip,
  printAppointmentSlip,
} from "../services/appointmentService";

const TABS = [
  { key: "today", label: "Today's queue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

function whenLabel(iso, fallback = "No time set") {
  if (!iso) return fallback;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({ appointment, children }) {
  const patient = appointment.patient_detail;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-slate-200 hover:shadow-sm">
      <Avatar name={appointment.patient} imageUrl={patient?.photo_url} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/dashboard/patients/${appointment.patient_id}`}
            className="truncate font-semibold text-slate-800 hover:text-brand-700"
          >
            {appointment.patient}
          </Link>
          <StatusBadge status={appointment.status} label={appointment.status_label} />
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-400">
          <HiOutlineClock className="h-3.5 w-3.5 shrink-0" />
          {whenLabel(appointment.scheduled_at, whenLabel(appointment.arrived_at, "Walk-in"))}
          {appointment.code && ` · ${appointment.code}`}
        </p>
        {appointment.reason && (
          <p className="mt-1 truncate text-xs text-slate-500">{appointment.reason}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * The appointment book. The PA's screen — the doctor's route to this is
 * blocked, and every write behind it is `@front_desk_only` on the server.
 *
 * Three tabs, which are three different questions rather than three filters
 * of one list: who is here now, who is coming, and what has already happened.
 * They are kept apart because the actions differ completely — you check a
 * booking in, you cancel a booking, and you can only read a past one.
 */
export default function Appointments() {
  const [tab, setTab] = useState("today");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const [queue, setQueue] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      try {
        const [queueRows, upcomingRows, history] = await Promise.all([
          fetchQueue(),
          fetchUpcoming(90),
          fetchAppointmentHistory({
            page_size: 50,
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
          }),
        ]);
        setQueue(queueRows);
        setUpcoming(upcomingRows);
        setPast(history.items || []);
        setErrorMsg("");
      } catch (err) {
        setErrorMsg(err.response?.data?.message || "Could not load appointments.");
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch]
  );

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load);

  async function handleCheckIn(appointment) {
    setBusyId(appointment.id);
    setErrorMsg("");
    try {
      await checkInAppointment(appointment.id);
      await load(true);
      setTab("today");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not check this patient in.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(reason) {
    const appointment = cancelling;
    setCancelling(null);
    setBusyId(appointment.id);
    try {
      await cancelAppointment(appointment.id, reason);
      await load(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not cancel this appointment.");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePrintSlip(appointment) {
    setBusyId(appointment.id);
    try {
      // Generated first: the slip is rendered on demand rather than stored, so
      // printing one that has never been generated would 404.
      await generateAppointmentSlip(appointment.id);
      await printAppointmentSlip(appointment.id, `${appointment.code}.pdf`);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not produce the slip.");
    } finally {
      setBusyId(null);
    }
  }

  // Client-side, and only on the two short lists. The past tab searches on the
  // server (it is paginated and can be long); today's queue and the upcoming
  // list are a day's and a quarter's worth of rows, already in memory, so
  // filtering them here is instant and costs no request.
  const term = debouncedSearch.trim().toLowerCase();
  const matches = (appointment) =>
    !term ||
    [appointment.patient, appointment.code, appointment.patient_detail?.code, appointment.reason]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(term));

  const visibleQueue = queue.filter(matches);
  const visibleUpcoming = upcoming.filter(matches);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
        </div>
        <button
          onClick={() => setBooking(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <HiOutlineCalendarDays className="h-4.5 w-4.5" />
          Book appointment
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          busy={search !== debouncedSearch}
          placeholder="Find an appointment by patient, ID or reason…"
          className="sm:max-w-md sm:flex-1"
        />
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setTab(entry.key)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                tab === entry.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : tab === "today" ? (
        <QueueBoard
          queue={visibleQueue}
          emptyMessage="Nobody has been checked in yet. Book a walk-in, or check a booking in from the Upcoming tab when the patient arrives."
        />
      ) : tab === "upcoming" ? (
        visibleUpcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <HiOutlineCalendarDays className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">Nothing booked ahead</p>
            <p className="mt-1 text-xs text-slate-400">
              Book an appointment and it will appear here until the patient arrives.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleUpcoming.map((appointment) => (
              <Row key={appointment.id} appointment={appointment}>
                <button
                  onClick={() => handleCheckIn(appointment)}
                  disabled={busyId === appointment.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  <HiOutlineArrowRightOnRectangle className="h-3.5 w-3.5" />
                  Check in
                </button>
                <button
                  onClick={() => setRescheduling(appointment)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                  Reschedule
                </button>
                <button
                  onClick={() => handlePrintSlip(appointment)}
                  disabled={busyId === appointment.id}
                  aria-label="Print appointment slip"
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-60"
                >
                  <HiOutlinePrinter className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCancelling(appointment)}
                  aria-label="Cancel appointment"
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <HiOutlineXCircle className="h-4 w-4" />
                </button>
              </Row>
            ))}
          </div>
        )
      ) : past.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <HiOutlineClock className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            {debouncedSearch ? "No past appointments match" : "Nothing here yet"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Completed and cancelled appointments are kept here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {past.map((appointment) => (
            <Row key={appointment.id} appointment={appointment}>
              {appointment.consultation_id && (
                <Link
                  to={`/dashboard/patients/${appointment.patient_id}`}
                  className="rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  View record
                </Link>
              )}
            </Row>
          ))}
        </div>
      )}

      {booking && (
        <BookAppointmentModal onClose={() => setBooking(false)} onBooked={() => load(true)} />
      )}

      {rescheduling && (
        <BookAppointmentModal
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onBooked={() => load(true)}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title={`Cancel ${cancelling.patient}'s appointment?`}
          message={`${whenLabel(cancelling.scheduled_at)}\n\nThe appointment stays on file as cancelled, so the record still shows they were expected.`}
          confirmLabel="Cancel appointment"
          cancelLabel="Keep it"
          destructive
          onConfirm={() => handleCancel("Cancelled at the desk")}
          onCancel={() => setCancelling(null)}
        />
      )}
    </div>
  );
}
