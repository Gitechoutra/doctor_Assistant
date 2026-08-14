import { useEffect, useState } from "react";
import Modal from "./Modal";
import SearchInput from "./SearchInput";
import Avatar from "./Avatar";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { createAppointment, updateAppointment } from "../services/appointmentService";
import { fetchPatients } from "../services/patientService";

const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in *local* time, and
 *  `toISOString()` gives UTC — using it directly shifted every default by the
 *  timezone offset, so a form opened at 10am proposed 4:30am. */
function localInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function defaultSlot() {
  // Tomorrow at 10:00 — a booking is almost never for right now (that is what
  // the walk-in option is for), so the default should not need clearing.
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(10, 0, 0, 0);
  return localInputValue(when);
}

function PatientPicker({ onPick }) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPatients("all", debounced, 25)
      .then((rows) => active && setResults(rows))
      .catch(() => active && setResults([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debounced]);

  return (
    <div className="space-y-3">
      <SearchInput
        value={search}
        onChange={setSearch}
        busy={loading || search !== debounced}
        autoFocus
        placeholder="Find a patient by name, ID or phone…"
      />
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {results.length === 0 && !loading ? (
          <p className="py-8 text-center text-xs text-slate-400">
            {debounced ? "No patients match that search." : "No patients on file yet."}
          </p>
        ) : (
          results.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => onPick(patient)}
              className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50"
            >
              <Avatar name={patient.name} imageUrl={patient.photo_url} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{patient.name}</p>
                <p className="truncate text-xs text-slate-400">
                  {[patient.code, patient.phone, patient.age != null && `${patient.age} yrs`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Booking a patient in, and moving a booking that already exists.
 *
 * Two modes, one form:
 *
 *   `patient`     — book this person. Skips the picker.
 *   `appointment` — reschedule this booking. The patient is fixed and only
 *                   the time can move.
 *   neither       — pick a patient first, then book.
 *
 * The walk-in switch is the important one. A practice takes bookings by phone
 * for next week *and* has people turn up at the desk, and those are different
 * enough that guessing between them from a timestamp would get it wrong: a
 * walk-in joins today's queue immediately, a booking waits to be checked in.
 * Making it an explicit choice is what keeps the queue honest about who is
 * actually in the building.
 */
export default function BookAppointmentModal({
  patient: fixedPatient,
  appointment,
  onClose,
  onBooked,
}) {
  const isReschedule = Boolean(appointment);
  const [patient, setPatient] = useState(fixedPatient || null);
  const [walkIn, setWalkIn] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(
    appointment?.scheduled_at
      ? localInputValue(new Date(appointment.scheduled_at))
      : defaultSlot()
  );
  const [reason, setReason] = useState(appointment?.reason || "");
  const [notes, setNotes] = useState(appointment?.notes || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const subject = isReschedule ? appointment.patient : patient?.name;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      if (isReschedule) {
        await updateAppointment(appointment.id, {
          scheduled_at: scheduledAt,
          reason: reason.trim(),
          notes: notes.trim(),
        });
      } else {
        await createAppointment({
          patient_id: patient.id,
          walk_in: walkIn,
          // Omitted for a walk-in: they are here now, and a future slot
          // alongside would contradict that.
          ...(walkIn ? {} : { scheduled_at: scheduledAt }),
          reason: reason.trim(),
          notes: notes.trim(),
        });
      }
      onBooked?.();
      onClose();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save this appointment.");
    } finally {
      setSaving(false);
    }
  }

  const title = isReschedule
    ? `Reschedule — ${subject}`
    : patient
      ? `Book ${patient.name}`
      : "Book an appointment";

  return (
    <Modal title={title} onClose={onClose}>
      {!patient && !isReschedule ? (
        <PatientPicker onPick={setPatient} />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isReschedule && !fixedPatient && (
            <button
              type="button"
              onClick={() => setPatient(null)}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              ← Choose a different patient
            </button>
          )}

          {!isReschedule && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={walkIn}
                onChange={(e) => setWalkIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-700">
                  Walk-in — they are here now
                </span>
                <span className="block text-xs text-slate-500">
                  Joins today&rsquo;s queue straight away instead of waiting to be
                  checked in.
                </span>
              </span>
            </label>
          )}

          {!walkIn && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Date and time
              </span>
              <input
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={INPUT}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              Reason for visit
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fever for three days"
              className={INPUT}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              Notes
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the doctor should know before they come in"
              className={INPUT}
            />
          </label>

          {errorMsg && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving…"
                : isReschedule
                  ? "Move appointment"
                  : walkIn
                    ? "Add to today's queue"
                    : "Book appointment"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
