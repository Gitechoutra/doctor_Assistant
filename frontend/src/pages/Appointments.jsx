import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  HiOutlineArrowRightCircle,
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
import { useAuth } from "../context/AuthContext";
import {
  cancelAppointment,
  checkInAppointment,
  fetchAppointmentHistory,
  fetchAppointments,
  fetchQueue,
  fetchUpcoming,
  generateAppointmentSlip,
  printAppointmentSlip,
  startAppointment,
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

/**
 * One appointment, on either role's screen.
 *
 * The identifying line is name, then age · gender · phone. The phone number is
 * on the card rather than one click into the record because of what both
 * people do at this screen: the desk rings the patient who has not turned up,
 * and the doctor checks they have called the right Ramu of the two on the
 * list. A field that decides which row you act on belongs on the row.
 *
 * It wraps rather than truncating below `sm` — a phone number cut off at
 * "+91 98765…" is worse than no phone number, because it looks like one.
 */
function Row({ appointment, serial, children }) {
  const patient = appointment.patient_detail;
  const identity = [
    patient?.age != null ? `${patient.age} yrs` : null,
    patient?.gender,
    patient?.phone,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-slate-200 hover:shadow-sm">
      <div className="relative shrink-0">
        <Avatar name={appointment.patient} imageUrl={patient?.photo_url} size="md" />
        {serial != null && (
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-slate-800 text-[10px] font-semibold text-white">
            {serial}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/dashboard/patients/${appointment.patient_id}`}
            className="truncate font-semibold text-slate-800 hover:text-brand-700"
          >
            {appointment.patient}
          </Link>
          <StatusBadge status={appointment.status} label={appointment.status_label} />
        </div>
        {identity && <p className="mt-0.5 text-xs text-slate-500">{identity}</p>}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
          <HiOutlineClock className="h-3.5 w-3.5 shrink-0" />
          {whenLabel(appointment.scheduled_at, whenLabel(appointment.arrived_at, "Walk-in"))}
          {appointment.code && <span>· {appointment.code}</span>}
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
 * The doctor's appointments: today's unfinished work, and the button that
 * calls each patient in.
 *
 * Deliberately only the open statuses — booked, waiting, in consultation. A
 * completed visit is history and belongs in Consultations; showing it here
 * would mean the doctor scanning past patients they have already seen to find
 * the one still in the waiting room. That split is the server's, not this
 * page's: `GET /appointments` with no status filter returns exactly the rows
 * that have not closed, already scoped to the calling doctor.
 *
 * The desk's half of this screen — checking in, rescheduling, cancelling — is
 * `FrontDeskAppointments` below. Same path, because it is the same book; two
 * components, because the two people do genuinely different things to it, and
 * a single screen with half its buttons disabled tells neither of them what it
 * is for.
 */
function DoctorAppointments() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [startingId, setStartingId] = useState(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      try {
        const rows = await fetchAppointments(
          debouncedSearch ? { search: debouncedSearch } : {}
        );
        setAppointments(rows);
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

  // A patient checked in at the desk, or a consultation ended, changes this
  // list without the doctor touching anything.
  useLiveRefresh(load);

  async function handleStart(appointment) {
    setStartingId(appointment.id);
    setErrorMsg("");
    try {
      const consultation = await startAppointment(appointment.id);
      navigate(`/dashboard/consultations/${consultation.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not start this consultation.");
      load(true);
    } finally {
      setStartingId(null);
    }
  }

  // In consultation first, then those who are here, then what is booked ahead
  // — the order the doctor works down the list. Within each, whoever has been
  // waiting longest.
  const RANK = { in_progress: 0, waiting: 1, scheduled: 2 };
  const ordered = [...appointments].sort((a, b) => {
    const byStatus = (RANK[a.status] ?? 3) - (RANK[b.status] ?? 3);
    if (byStatus) return byStatus;
    const at = a.arrived_at || a.scheduled_at || a.created_at;
    const bt = b.arrived_at || b.scheduled_at || b.created_at;
    return new Date(at) - new Date(bt);
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
        <p className="mt-1 text-sm text-slate-500">
          Patients still to be seen — booked, waiting and in consultation.
        </p>
      </header>

      <SearchInput
        value={search}
        onChange={setSearch}
        busy={search !== debouncedSearch}
        placeholder="Find a patient by name, ID or reason…"
        className="sm:max-w-md"
      />

      {errorMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <HiOutlineCalendarDays className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            {debouncedSearch ? "No appointments match that search" : "Nothing outstanding"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
            {debouncedSearch
              ? "Try part of a name, or a patient ID like PAT0004."
              : "Patients appear here as the PA books and checks them in. Finished visits move to Consultations."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((appointment, index) => (
            <Row key={appointment.id} appointment={appointment} serial={index + 1}>
              {appointment.status === "in_progress" && appointment.consultation_id ? (
                <Link
                  to={`/dashboard/consultations/${appointment.consultation_id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                >
                  <HiOutlineArrowRightCircle className="h-4 w-4" />
                  Resume consultation
                </Link>
              ) : (
                // Offered for a booking that has not been checked in as well
                // as for a waiting patient: the doctor calling someone in who
                // walked past the desk is ordinary, and the server stamps the
                // arrival it never got (see `claim_appointment_for`).
                <button
                  onClick={() => handleStart(appointment)}
                  disabled={startingId === appointment.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <HiOutlineArrowRightCircle className="h-4 w-4" />
                  {startingId === appointment.id ? "Starting…" : "Start consultation"}
                </button>
              )}
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The appointment book. The PA's screen — every write behind it is
 * `@front_desk_only` on the server.
 *
 * Three tabs, which are three different questions rather than three filters
 * of one list: who is here now, who is coming, and what has already happened.
 * They are kept apart because the actions differ completely — you check a
 * booking in, you cancel a booking, and you can only read a past one.
 *
 * A booking is not made from here. It starts at the patient, not at the
 * calendar: the desk needs to know who is in front of them before a slot
 * means anything, and the record is where their history, their phone number
 * and the Book button already are. This screen is what happens to a booking
 * afterwards — arriving, moving, cancelling, printing.
 */
const TAB_KEYS = new Set(TABS.map((entry) => entry.key));

function FrontDeskAppointments() {
  // The dashboard's "Completed" card links straight at the Past tab
  // (`?tab=past`) the same way the doctor's links straight at Consultations —
  // each role lands on the screen that has their own completed visits.
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(TAB_KEYS.has(initialTab) ? initialTab : "today");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const [queue, setQueue] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [busyId, setBusyId] = useState(null);

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
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
        <p className="mt-1 text-sm text-slate-500">
          Check patients in, reschedule or cancel a booking, and print a slip.
        </p>
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
          emptyMessage="Nobody has been checked in yet. Check a booking in from the Upcoming tab when the patient arrives."
        />
      ) : tab === "upcoming" ? (
        visibleUpcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <HiOutlineCalendarDays className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">Nothing booked ahead</p>
            <p className="mt-1 text-xs text-slate-400">
              Appointments booked from a patient's record appear here until they arrive.
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

/**
 * One route, two screens. Which one you get is which job you have here: the
 * doctor sees the patients still to be seen and calls them in; the PA works
 * the book itself. Split at the top rather than by disabling controls inside
 * one component, so neither screen has to explain the other's buttons.
 */
export default function Appointments() {
  const { isDoctor } = useAuth();
  return isDoctor ? <DoctorAppointments /> : <FrontDeskAppointments />;
}
