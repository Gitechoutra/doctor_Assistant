import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXCircle,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import { Badge, EmptyState, PageHeader, RecordGrid } from "../components/RecordCard";
import { useAuth } from "../context/AuthContext";
import { isoDate, formatDay } from "../utils/dates";
import {
  cancelShift,
  createShift,
  deleteShift,
  fetchMyShifts,
  fetchShiftOptions,
  fetchShifts,
  updateShift,
} from "../services/shiftService";

const SLOT_TONES = {
  morning: "amber",
  evening: "brand",
  night: "slateSolid",
  custom: "slate",
};

// The slot names as a person reads them. The stored values are lower-case
// enum members ("morning"); a shift schedule is not the place to show a database value.
// There is no `afternoon` slot — the hospital runs three eight-hour turns and
// `evening` is the 14:00 one, so its hours are spelled out below rather than
// left to be inferred from the name.
const SLOT_LABELS = {
  morning: "Morning",
  evening: "Evening",
  night: "Night",
  custom: "Custom hours",
};

/** The ISO date a shift ends on — the next day when it runs through midnight. */
function shiftEndDate(shift) {
  if (!shift.crosses_midnight) return shift.shift_date;
  const d = new Date(`${shift.shift_date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const ROLE_LABELS = {
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
  pharmacist: "Pharmacist",
  lab_technician: "Lab technician",
  accountant: "Accountant",
  other_staff: "Staff",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** Groups a flat list into [date, shifts[]] pairs, preserving server order —
 *  the API already sorts by date then start time. */
function groupByDate(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.shift_date)) map.set(item.shift_date, []);
    map.get(item.shift_date).push(item);
  }
  return [...map.entries()];
}

function ShiftHours({ shift }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-slate-600">
      <HiOutlineClock className="h-4 w-4 shrink-0 text-slate-400" />
      {shift.starts_at} – {shift.ends_at}
      {/* A night shift ends the following morning. Saying so beats leaving a
          reader to work out why the end time is "before" the start. */}
      {shift.crosses_midnight && <span className="text-xs text-slate-400">(next day)</span>}
    </span>
  );
}

function ShiftBadges({ shift, showRole }) {
  return (
    <>
      <Badge tone={SLOT_TONES[shift.slot] || "slate"}>
        {SLOT_LABELS[shift.slot] || shift.slot}
      </Badge>
      {shift.status === "cancelled" && <Badge tone="amber">Cancelled</Badge>}
      {showRole && shift.staff_role && (
        <Badge tone="slate">{ROLE_LABELS[shift.staff_role] || shift.staff_role}</Badge>
      )}
      {shift.department && <Badge tone="slate">{shift.department}</Badge>}
    </>
  );
}

/**
 * One shift spelled out for the person working it: which day it starts, which
 * day it ends, and the hours on each side.
 *
 * The end date is stated rather than implied. A night shift is stored as one
 * row with an end time "before" its start, so 22:00–06:00 under a single date
 * heading reads as though it ends the same morning it began — the one detail
 * on this screen somebody could turn up a day late for.
 */
function ShiftWindow({ shift }) {
  const endDate = shiftEndDate(shift);
  const rows = [
    ["From", shift.shift_date, shift.starts_at],
    ["To", endDate, shift.ends_at],
  ];
  return (
    <dl className="grid grid-cols-[3rem_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([label, day, time]) => (
        <div key={label} className="contents">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </dt>
          <dd className="text-slate-700">
            {formatDay(day)}
            <span className="text-slate-400"> · </span>
            <span className="font-semibold text-slate-900">{time}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A from/to window. Shared by both views so the two read the same way. */
function RangePicker({ range, onChange }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold text-slate-600">
        From
        <input
          type="date"
          value={range.from}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        To
        <input
          type="date"
          value={range.to}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
          className={`mt-1 ${inputClass}`}
        />
      </label>
    </div>
  );
}

// ------------------------------------------------------------ read-only --

/**
 * What a doctor, nurse, receptionist or pharmacist sees.
 *
 * There is no manage affordance anywhere on this screen — not a disabled
 * button, not a hidden menu. The server refuses their writes regardless, but
 * showing a control they can never use only invites them to try.
 */
function MyShifts() {
  const [range, setRange] = useState({ from: isoDate(0), to: isoDate(30) });
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMyShifts({ from: range.from, to: range.to })
      .then((data) => {
        if (!active) return;
        setShifts(data.items || []);
        setErrorMsg("");
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err.response?.data?.message || "Could not load your shifts.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range.from, range.to]);

  const scheduled = shifts.filter((s) => s.status === "scheduled").length;

  return (
    <div>
      <PageHeader icon={HiOutlineCalendarDays} title="My shifts" />

      <div className="mt-5">
        <RangePicker range={range} onChange={setRange} />
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <p className="mt-5 text-sm text-slate-500">
        {loading
          ? "Loading…"
          : `${scheduled} shift${scheduled === 1 ? "" : "s"} in this period`}
      </p>

      {/* Three across on a desktop, two on a tablet, one on a phone — the same
          grid the record lists use, so a month of shifts is a few rows rather
          than a column of full-width bars nobody scrolls to the end of.
          `align="start"` keeps a card the height of its own contents: a shift
          carrying a note must not stretch the two beside it to match.

          No date headings here, unlike the administrator's schedule: each card
          already spells out the day it starts and the day it ends, and a
          heading per shift would put every card on a row of its own again. */}
      <div className="mt-3">
        {loading ? (
          <RecordGrid align="start">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </RecordGrid>
        ) : shifts.length === 0 ? (
          <EmptyState icon={HiOutlineCalendarDays}>
            You have no shifts scheduled in this period.
          </EmptyState>
        ) : (
          <RecordGrid align="start">
            {shifts.map((shift) => (
              <div
                key={shift.id}
                className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md ${
                  shift.status === "cancelled" ? "opacity-60" : ""
                }`}
              >
                {/* Deliberately just the shift: its type, its window and
                    whatever the shift schedule note says. The department and the
                    staff badges belong to the administrator's shift schedule, where
                    a row has to be told apart from everyone else's — here
                    every row is already this person's own. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SLOT_TONES[shift.slot] || "slate"}>
                    {SLOT_LABELS[shift.slot] || shift.slot}
                  </Badge>
                  {shift.status === "cancelled" && <Badge tone="amber">Cancelled</Badge>}
                </div>
                <div className="mt-3">
                  <ShiftWindow shift={shift} />
                </div>
                {shift.notes && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-500">
                    {shift.notes}
                  </p>
                )}
              </div>
            ))}
          </RecordGrid>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- admin --

/** How many days a from/to window covers, inclusive. 0 for anything that
 *  isn't a usable range — the submit button reads this to decide whether it
 *  can be pressed, so a half-typed date must not count as a day. */
function dayspan(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const days = Math.round((end - start) / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

function ShiftFormModal({ shift, options, onClose, onSaved }) {
  const editing = Boolean(shift);
  // Creating takes a window and writes one shift per day in it; editing moves
  // the one row it opened on. Both are held in `from_date` so the rest of the
  // form doesn't have to know which mode it is in — `to_date` is simply
  // ignored on an edit.
  const [form, setForm] = useState(() => ({
    user_id: shift?.user_id ? String(shift.user_id) : "",
    from_date: shift?.shift_date || isoDate(0),
    to_date: shift?.shift_date || isoDate(0),
    slot: shift?.slot || "morning",
    starts_at: shift?.starts_at || options.slot_hours?.morning?.starts_at || "06:00",
    ends_at: shift?.ends_at || options.slot_hours?.morning?.ends_at || "14:00",
    status: shift?.status || "scheduled",
  }));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  // Moving the start past the end drags the end with it. Leaving them crossed
  // would mean the range covers no days at all and the button is dead until the
  // admin works out which of the two fields to fix.
  function handleFromDate(e) {
    const from_date = e.target.value;
    setForm((f) => ({
      ...f,
      from_date,
      to_date: !f.to_date || f.to_date < from_date ? from_date : f.to_date,
    }));
  }

  // Picking a named slot fills its standard hours in, which the admin can
  // then override. `custom` leaves whatever is already there.
  function handleSlot(e) {
    const slot = e.target.value;
    const hours = options.slot_hours?.[slot];
    setForm((f) => ({
      ...f,
      slot,
      starts_at: hours?.starts_at ?? f.starts_at,
      ends_at: hours?.ends_at ?? f.ends_at,
    }));
  }

  // How many rows this form will write. Not shown anywhere — it is only what
  // decides whether the button can be pressed, so a backwards range is refused
  // before it reaches the server. Editing always touches exactly the one row it
  // opened on, whatever `to_date` happens to still hold.
  const days = editing ? 1 : dayspan(form.from_date, form.to_date);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    // Department and notes are deliberately absent, not sent empty: the API
    // only writes a field when its key is present, so leaving them out keeps
    // whatever an existing shift already carries instead of clearing it on
    // every edit made through this form.
    const payload = {
      user_id: form.user_id ? Number(form.user_id) : null,
      slot: form.slot,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
    };
    // A create spans a window and the server writes one shift per day in it;
    // an edit moves the single row it opened on.
    if (editing) {
      payload.shift_date = form.from_date;
    } else {
      payload.from_date = form.from_date;
      payload.to_date = form.to_date;
    }
    // Only on edit: creating always starts a shift scheduled, and sending a
    // status on create would offer a "schedule it already cancelled" that means
    // nothing. On edit this is what puts a cancelled shift back on the shift schedule.
    if (editing) payload.status = form.status;
    try {
      const saved = editing
        ? await updateShift(shift.id, payload)
        : await createShift(payload);
      onSaved(saved);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save that shift.");
    } finally {
      setSaving(false);
    }
  }

  const staffByRole = useMemo(() => {
    const map = new Map();
    for (const s of options.staff || []) {
      const key = s.role || "other_staff";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return [...map.entries()];
  }, [options.staff]);

  return (
    <Modal title={editing ? "Edit shift" : "Add a Shift"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Assign to *
          </label>
          <select
            required
            className={inputClass}
            value={form.user_id}
            onChange={update("user_id")}
          >
            {/* A shift belongs to somebody. The placeholder is disabled rather
                than a selectable "nobody": it is what an untouched form shows,
                not an answer the admin can leave in place. */}
            <option value="" disabled>
              Select a staff member
            </option>
            {staffByRole.map(([role, people]) => (
              <optgroup key={role} label={ROLE_LABELS[role] || role}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* A run of days, not one. The same person works the same slot across
            a week or a month, and making the administrator reopen this form
            for each of those days is how a shift schedule ends up with holes in it.
            Editing narrows back to a single date: a range there would have to
            answer what happens to the row already on screen. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {editing ? "Date *" : "From date *"}
            </label>
            <input
              required
              type="date"
              className={inputClass}
              value={form.from_date}
              onChange={editing ? update("from_date") : handleFromDate}
            />
          </div>
          {!editing && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                To date *
              </label>
              <input
                required
                type="date"
                // The browser refuses a backwards range before the form has to
                // explain one.
                min={form.from_date}
                className={inputClass}
                value={form.to_date}
                onChange={update("to_date")}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Slot *</label>
            <select className={inputClass} value={form.slot} onChange={handleSlot}>
              {(options.slots || []).map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABELS[s] || s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Starts *</label>
            <input
              required
              type="time"
              className={inputClass}
              value={form.starts_at}
              onChange={update("starts_at")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Ends *</label>
            <input
              required
              type="time"
              className={inputClass}
              value={form.ends_at}
              onChange={update("ends_at")}
            />
          </div>
        </div>

        {/* Edit only. Cancelling is done from the shift schedule, but putting a shift
            back is only possible here — without this a cancelled shift could
            never return to the shift schedule, and deleting it (the only other way out)
            destroys the history that cancelling exists to keep. */}
        {editing && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
            <select className={inputClass} value={form.status} onChange={update("status")}>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {shift?.status === "cancelled" && form.status === "scheduled" && (
              <p className="mt-1 text-xs text-slate-500">
                Saving will put this shift back on the shift schedule.
              </p>
            )}
          </div>
        )}

        {errorMsg && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={saving || days === 0 || !form.user_id}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Add shift"}
        </button>
      </form>
    </Modal>
  );
}

/** The administrator's shift schedule: create, assign, edit, cancel and delete. */
function ShiftManager() {
  const [range, setRange] = useState({ from: isoDate(0), to: isoDate(14) });
  const [filters, setFilters] = useState({ role: "all", user_id: "", status: "all" });
  const [shifts, setShifts] = useState([]);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [editing, setEditing] = useState(null); // shift object, or "new"
  const [confirming, setConfirming] = useState(null); // { shift, action }
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = { from: range.from, to: range.to };
    if (filters.role !== "all") params.role = filters.role;
    if (filters.user_id) params.user_id = filters.user_id;
    if (filters.status !== "all") params.status = filters.status;
    return fetchShifts(params)
      .then((data) => {
        setShifts(data.items || []);
        setErrorMsg("");
      })
      .catch((err) => setErrorMsg(err.response?.data?.message || "Could not load the shift schedule."))
      .finally(() => setLoading(false));
  }, [range.from, range.to, filters.role, filters.user_id, filters.status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchShiftOptions()
      .then(setOptions)
      .catch(() => setErrorMsg("Could not load the shift options."));
  }, []);

  async function handleConfirm() {
    if (!confirming) return;
    setBusy(true);
    try {
      if (confirming.action === "cancel") await cancelShift(confirming.shift.id);
      else await deleteShift(confirming.shift.id);
      setConfirming(null);
      load();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not update that shift.");
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => groupByDate(shifts), [shifts]);
  const unassigned = shifts.filter((s) => !s.assigned && s.status === "scheduled").length;
  // Whether anything other than the date window is narrowing the list. An
  // empty shift schedule and a shift schedule filtered down to nothing look identical, and saying
  // "no shifts scheduled" for the second reads as though the save failed — the
  // filters persist across a save, so scheduling a nurse while filtered to
  // doctors makes a shift that really was stored appear not to exist.
  const filtered = filters.role !== "all" || filters.user_id || filters.status !== "all";

  return (
    <div>
      <PageHeader
        icon={HiOutlineCalendarDays}
        title="Staff shifts"
        action={
          <button
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Add a Shift
          </button>
        }
      />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <RangePicker range={range} onChange={setRange} />

        <label className="text-xs font-semibold text-slate-600">
          Role
          <select
            value={filters.role}
            onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value, user_id: "" }))}
            className={`mt-1 ${inputClass}`}
          >
            <option value="all">All roles</option>
            {(options.roles || []).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-600">
          Staff member
          <select
            value={filters.user_id}
            onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Everyone</option>
            <option value="unassigned">Unassigned slots</option>
            {(options.staff || [])
              .filter((s) => filters.role === "all" || s.role === filters.role)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-600">
          Status
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className={`mt-1 ${inputClass}`}
          >
            <option value="all">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <p className="mt-5 text-sm text-slate-500">
        {loading ? "Loading…" : `${shifts.length} shift${shifts.length === 1 ? "" : "s"}`}
        {!loading && unassigned > 0 && ` · ${unassigned} still unassigned`}
      </p>

      <div className="mt-3 space-y-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))
        ) : shifts.length === 0 ? (
          <EmptyState icon={HiOutlineCalendarDays}>
            {filtered ? (
              <>
                No shifts match these filters in this period.{" "}
                <button
                  onClick={() => setFilters({ role: "all", user_id: "", status: "all" })}
                  className="font-semibold text-brand-600 underline underline-offset-2"
                >
                  Clear filters
                </button>{" "}
                to see the whole shift schedule.
              </>
            ) : (
              "No shifts scheduled for this period. Use “Add a Shift” to add one."
            )}
          </EmptyState>
        ) : (
          grouped.map(([day, rows]) => (
            <div key={day}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {formatDay(day)}
              </p>
              <div className="mt-2 space-y-2">
                {rows.map((shift) => (
                  <div
                    key={shift.id}
                    className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md ${
                      shift.status === "cancelled" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {shift.assigned ? (
                          <Avatar
                            name={shift.staff_name}
                            imageUrl={shift.staff_avatar_url}
                            size="md"
                          />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-slate-300 text-slate-300">
                            ?
                          </span>
                        )}
                        <div className="min-w-0">
                          <p
                            className={`truncate font-semibold ${
                              shift.assigned ? "text-slate-900" : "text-slate-400"
                            }`}
                          >
                            {shift.staff_name || "Unassigned"}
                          </p>
                          <ShiftHours shift={shift} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <ShiftBadges shift={shift} showRole />
                      </div>
                    </div>

                    {shift.notes && (
                      <p className="mt-2 text-sm text-slate-500">{shift.notes}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <button
                        onClick={() => setEditing(shift)}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        <HiOutlinePencilSquare className="h-4 w-4" />
                        {shift.assigned ? "Edit" : "Assign"}
                      </button>
                      {shift.status === "scheduled" && (
                        <button
                          onClick={() => setConfirming({ shift, action: "cancel" })}
                          className="flex items-center gap-1.5 rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                        >
                          <HiOutlineXCircle className="h-4 w-4" />
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => setConfirming({ shift, action: "delete" })}
                        className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <ShiftFormModal
          shift={editing === "new" ? null : editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming.action === "cancel" ? "Cancel this shift?" : "Delete this shift?"}
          message={
            confirming.action === "cancel"
              ? "It stays on the schedule marked cancelled, so the record of who was meant to work it survives. You can put it back to scheduled by editing it."
              : "This removes the shift outright. Cancel it instead if you want the schedule to keep a record of it."
          }
          confirmLabel={confirming.action === "cancel" ? "Cancel shift" : "Delete"}
          // "Cancel" as the dismiss label next to a "Cancel shift" button
          // would be genuinely ambiguous.
          cancelLabel="Go back"
          destructive={confirming.action === "delete"}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

/**
 * Shifts are managed centrally by the administrator; everyone else reads
 * their own. One route, two screens, chosen by role — a non-admin never
 * renders a control they are not allowed to use, and the API enforces the
 * same split independently.
 */
export default function Shifts() {
  const { user } = useAuth();
  return user?.role === "admin" ? <ShiftManager /> : <MyShifts />;
}
