import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineClock,
  HiOutlineMagnifyingGlass,
  HiOutlineMoon,
  HiOutlineUserGroup,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import { Badge, EmptyState, PageHeader } from "../components/RecordCard";
import { fetchDepartments } from "../services/departmentService";
import { fetchDoctorAvailability } from "../services/doctorService";
import { isoDate, formatDay } from "../utils/dates";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** The four answers a day can have, in the words the front desk would use.
 *
 *  `off` and `finished` are deliberately different: one means the doctor is
 *  not in today at all, the other that they were and have gone. Booking a
 *  patient in reads very differently against each. */
const STATUS = {
  on_duty: { label: "On duty now", tone: "emerald" },
  upcoming: { label: "In later", tone: "brand" },
  finished: { label: "Shift finished", tone: "slate" },
  scheduled: { label: "Working", tone: "brand" },
  off: { label: "No shift", tone: "slate" },
};

const USUAL_SHIFT_LABELS = {
  morning: "Usually mornings",
  evening: "Usually evenings",
  night: "Usually nights",
};

/** A 24-hour bar with the doctor's scheduled hours shaded on it.
 *
 *  The point is comparison: three doctors' bars stacked in a list show who
 *  overlaps and where the gaps are, which a list of "09:00 – 17:00" strings
 *  does not. Positions come from the server's `start_minute`/`end_minute` so a
 *  night shift running past midnight is clamped to the day being shown rather
 *  than wrapping to a block that appears to start before it ends.
 */
function DayBar({ shifts, nowMinute }) {
  const DAY = 24 * 60;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      {shifts.map((s) => {
        const left = Math.max(0, s.start_minute);
        const right = Math.min(DAY, s.end_minute);
        if (right <= left) return null;
        return (
          <span
            key={s.id}
            title={`${s.starts_at} – ${s.ends_at}`}
            className="absolute inset-y-0 rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
            style={{ left: `${(left / DAY) * 100}%`, width: `${((right - left) / DAY) * 100}%` }}
          />
        );
      })}
      {/* Only drawn for today — a "now" marker on next Tuesday means nothing. */}
      {nowMinute != null && (
        <span
          className="absolute inset-y-0 w-0.5 bg-slate-900/70"
          style={{ left: `${(nowMinute / DAY) * 100}%` }}
        />
      )}
    </div>
  );
}

/** The hours themselves, spelled out. The bar is for scanning; this is what
 *  gets read aloud to a patient on the phone. */
function ShiftHours({ shifts }) {
  if (shifts.length === 0) return <span className="text-sm text-slate-400">No hours scheduled</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {shifts.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"
        >
          {s.crosses_midnight ? (
            <HiOutlineMoon className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <HiOutlineClock className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          {s.starts_at} – {s.ends_at}
          {s.from_previous_day ? (
            <span className="text-xs font-normal text-slate-400">(since yesterday)</span>
          ) : (
            s.crosses_midnight && (
              <span className="text-xs font-normal text-slate-400">(next day)</span>
            )
          )}
        </span>
      ))}
    </div>
  );
}

/** One doctor's day: who they are, when they work, and where that puts them
 *  right now. */
function DoctorRow({ doctor, nowMinute }) {
  const status = STATUS[doctor.status] || STATUS.off;
  const meta = [doctor.department, doctor.specialization].filter(Boolean).join(" · ");

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
        doctor.on_duty ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={doctor.name} imageUrl={doctor.avatar_url} size="md" />
          <div className="min-w-0">
            {/* Names are stored as the hospital writes them, "Dr." and all —
                prefixing here would render "Dr. Dr. Mahesh". */}
            <p className="truncate font-semibold text-slate-900">{doctor.name}</p>
            <p className="truncate text-xs text-slate-400">{meta || "No department set"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {doctor.hours > 0 && <Badge tone="slate">{doctor.hours} hrs</Badge>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ShiftHours shifts={doctor.shifts} />
        {/* The single fact a receptionist is actually after: when can I put a
            patient in front of this doctor. */}
        {doctor.status === "on_duty" && doctor.available_until && (
          <span className="text-xs font-semibold text-emerald-700">
            Available until {doctor.available_until}
          </span>
        )}
        {doctor.status === "upcoming" && doctor.available_from && (
          <span className="text-xs font-semibold text-brand-700">
            Available from {doctor.available_from}
          </span>
        )}
        {doctor.status === "off" && doctor.usual_shift && (
          <span className="text-xs text-slate-400">
            {USUAL_SHIFT_LABELS[doctor.usual_shift] || doctor.usual_shift}
          </span>
        )}
      </div>

      {doctor.shifts.length > 0 && (
        <div className="mt-3">
          <DayBar shifts={doctor.shifts} nowMinute={nowMinute} />
          <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-300">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>
      )}

      {doctor.shifts.some((s) => s.notes) && (
        <p className="mt-2 text-xs text-slate-500">
          {doctor.shifts
            .map((s) => s.notes)
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * When each doctor is in, so the front desk can book a patient with someone
 * who will actually be there.
 *
 * Reads the hospital shift schedule, filtered to doctors. It is not the
 * Shifts screen:
 * `/dashboard/shifts` still shows a receptionist nothing but their own shifts,
 * and the API keeps that split — this endpoint answers the narrower question
 * reception has a reason to ask.
 */
export default function DoctorAvailability() {
  const [date, setDate] = useState(isoDate(0));
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = { date };
    if (departmentId) params.department_id = departmentId;
    return fetchDoctorAvailability(params)
      .then((res) => {
        setData(res);
        setErrorMsg("");
      })
      .catch((err) =>
        setErrorMsg(err.response?.data?.message || "Could not load doctor availability.")
      )
      .finally(() => setLoading(false));
  }, [date, departmentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchDepartments()
      .then(setDepartments)
      .catch(() => {
        /* The filter is a convenience; the list below still loads without it. */
      });
  }, []);

  // Whose shift boundary has passed while this screen sat open. Refetching on
  // a timer would fight with the date the user picked, so the page reloads on
  // demand instead and says what its answers are as of.
  // Memoized because the `|| []` fallback is a fresh array on every render,
  // which would re-run the filter and the sort below for a keystroke anywhere.
  const items = useMemo(() => data?.items || [], [data]);
  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      term
        ? items.filter(
            (d) =>
              d.name?.toLowerCase().includes(term) ||
              d.specialization?.toLowerCase().includes(term) ||
              d.department?.toLowerCase().includes(term)
          )
        : items,
    [items, term]
  );

  // The "now" line on the bars, in minutes from midnight. Only for today, and
  // taken from the same clock the server reported so the marker and the
  // badges cannot disagree.
  const nowMinute = useMemo(() => {
    if (!data?.is_today || !data?.as_of) return null;
    const [h, m] = data.as_of.split(":").map(Number);
    return h * 60 + m;
  }, [data?.is_today, data?.as_of]);

  const onDutyFirst = useMemo(
    () =>
      [...visible].sort((a, b) => {
        const rank = (d) => (d.on_duty ? 0 : d.shifts.length ? 1 : 2);
        return rank(a) - rank(b) || (a.name || "").localeCompare(b.name || "");
      }),
    [visible]
  );

  return (
    <div>
      <PageHeader
        icon={HiOutlineClock}
        title="Doctor availability"
        action={
          <Link
            to="/dashboard/doctors"
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <HiOutlineUserGroup className="h-4 w-4" />
            All doctors
          </Link>
        }
      />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || isoDate(0))}
            className={`mt-1 ${inputClass}`}
          />
        </label>

        {/* The two days anyone books on, without opening the picker. */}
        <div className="flex gap-2 pb-0.5">
          {[
            ["Today", isoDate(0)],
            ["Tomorrow", isoDate(1)],
          ].map(([label, value]) => (
            <button
              key={label}
              onClick={() => setDate(value)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                date === value
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="text-xs font-semibold text-slate-600">
          Department
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[12rem] flex-1 text-xs font-semibold text-slate-600">
          Search
          <div className="relative mt-1">
            <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Doctor, department or specialization"
              className={`${inputClass} pl-9`}
            />
          </div>
        </label>
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <p className="mt-5 text-sm text-slate-500">
        {loading ? (
          "Loading…"
        ) : (
          <>
            {formatDay(date)} · {data?.scheduled_count || 0} of {items.length} doctor
            {items.length === 1 ? "" : "s"} scheduled
            {data?.is_today && (
              <>
                {" · "}
                <span className="font-semibold text-emerald-700">
                  {data.on_duty_count} on duty now
                </span>
                {data.as_of && (
                  <span className="text-slate-400"> (as of {data.as_of})</span>
                )}
              </>
            )}
          </>
        )}
      </p>

      <div className="mt-3 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))
        ) : onDutyFirst.length === 0 ? (
          <EmptyState icon={HiOutlineClock}>
            {items.length === 0
              ? "No doctors to show for this department."
              : "No doctors match that search."}
          </EmptyState>
        ) : (
          onDutyFirst.map((doctor) => (
            <DoctorRow key={doctor.id} doctor={doctor} nowMinute={nowMinute} />
          ))
        )}
      </div>

      {!loading && items.length > 0 && data?.scheduled_count === 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Nobody has a shift on {formatDay(date)}. Shifts are set by the hospital
          administrator — ask them to schedule this day if that looks wrong.
        </p>
      )}
    </div>
  );
}
