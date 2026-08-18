import { useState } from "react";
import { HiOutlineQueueList } from "react-icons/hi2";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";
import { BLOOD_GROUPS } from "../constants/patient";
import { addToTodaysQueue } from "../services/appointmentService";
import { PHONE_DIGITS, PHONE_ERROR, digitsOnly, isPhoneIncomplete } from "../utils/contact";

/**
 * Registering a patient, and correcting one afterwards.
 *
 * One component for both, because they are the same form twice — the fields
 * the desk collects are the fields the desk can fix, and two components would
 * be two places for a field to go missing from. `patient` decides which:
 * absent means a new registration, present means an edit.
 *
 * Who the patient is and how to reach them: name, gender, date of birth or
 * age, a mobile number and an address. Phone and age are required — a
 * registration the desk cannot call back on, or with nobody sure how old the
 * patient is, is one that causes trouble later rather than at the counter.
 * Everything clinical (allergies, conditions, history, notes) and the rest of
 * the contact detail (email, next of kin) still lives on the record and is
 * still shown on the patient's page — this form does not touch it.
 *
 * Nothing is marked wrong before the desk has had a chance to get it right.
 * A required field says so once it has been visited and left, or once the
 * button at the bottom has been pressed — a form that opens already covered
 * in red is telling somebody off for not having typed yet, and it buries the
 * one message that will matter later among two that do not yet.
 *
 * Date of birth or age, not both kept independently. Typing a date of birth
 * fills the age in from it — `calcAge` below mirrors `Patient.age` on the
 * server, which prefers the date whenever one is on file — but the age field
 * is never locked: a patient who only knows their age can have one typed
 * directly, and a typed age can still be adjusted afterwards. The server has
 * the same final say either way (`patient_routes.update_patient`), so this is
 * about what the desk sees while filling the form in, not a second source of
 * truth.
 */

/** Today, as `YYYY-MM-DD` — the ceiling on the date of birth picker. A birth
 *  date after today is not early data entry, it is a typo. */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Whole years from a `YYYY-MM-DD` date of birth, counted the same way
 *  `Patient.age` counts them on the server: this year's birthday only counts
 *  once it has actually happened. Empty or unparsable comes back as "" so it
 *  never fights with whatever the age field already holds. */
function calcAge(dobStr) {
  if (!dobStr) return "";
  const dob = new Date(`${dobStr}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age >= 0 ? String(age) : "";
}

function Field({ label, children, hint, error, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
      )}
    </label>
  );
}

const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** The same input, once a message is showing beneath it. Only the border and
 *  the focus ring change colour — the field keeps its shape, so a form with
 *  one thing to fix still reads as the form rather than as an error screen. */
const INPUT_INVALID =
  "w-full rounded-xl border border-red-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100";

/** Every field this form owns, and the only ones it will ever send.
 *
 *  `fromPatient` copies these keys and no others out of a record, so what the
 *  form does not draw it cannot overwrite: the phone number, the address, the
 *  next of kin, the allergies and the medical history all stay as they were
 *  recorded, and so do `id`, `code` and the rest of the read-only half. */
function blank() {
  return {
    name: "",
    gender: "",
    dob: "",
    age: "",
    phone: "",
    address: "",
    blood_group: "",
  };
}

function fromPatient(patient) {
  const form = blank();
  // Field by field, coalescing null to "". A record only ever holds the parts
  // that were filled in, so every other column comes back as JSON null, and
  // null where a string belongs turns a controlled input into an uncontrolled
  // one — the same spread is what used to crash this form on a patient with
  // no phone number on file.
  for (const key of Object.keys(form)) {
    if (patient[key] != null) form[key] = patient[key];
  }
  return {
    ...form,
    // `age` is a property on the server, derived from `dob` when the record
    // has one — see `Patient.age`. Showing what it computed is right either
    // way, and an edit that sends it back unchanged says nothing new.
    age: patient.age ?? "",
    gender: patient.gender || "",
    dob: patient.dob || "",
    phone: patient.phone || "",
    address: patient.address || "",
    blood_group: patient.blood_group || "",
  };
}

export default function PatientFormModal({ patient, queueEntry, onClose, onSave, onQueueGenerated }) {
  const isEdit = Boolean(patient);
  const [form, setForm] = useState(() => (patient ? fromPatient(patient) : blank()));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Which fields have been visited and left, and whether the button has been
  // pressed at least once. Between them they decide whether a field's message
  // is on screen — the checks themselves (`nameError` and friends below) run
  // either way, because what blocks the save must not depend on what is shown.
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);

  // Mirrors `queueEntry` locally so "Generate Queue" below can show the
  // result the moment the server confirms it, rather than waiting on the
  // list behind this modal to refetch and pass a new prop down.
  const [queueState, setQueueState] = useState(queueEntry || null);
  const [generatingQueue, setGeneratingQueue] = useState(false);
  const [queueMsg, setQueueMsg] = useState("");

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function touch(field) {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  }

  /** A field's message, or "" while it is still too early to show it. */
  function shown(field, message) {
    return message && (attempted || touched[field]) ? message : "";
  }

  async function handleGenerateQueue() {
    setGeneratingQueue(true);
    setQueueMsg("");
    setErrorMsg("");
    try {
      const { message, appointment } = await addToTodaysQueue(patient.id);
      setQueueState(appointment);
      setQueueMsg(
        appointment.status === "in_progress"
          ? `${message} — with the doctor now.`
          : `${message}. Queue Number: #${appointment.queue_number}`
      );
      // Refreshes the card behind this modal — the list is where the queue
      // number is actually meant to be seen; this panel only confirms it.
      onQueueGenerated?.();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not add this patient to today's queue."
      );
    } finally {
      setGeneratingQueue(false);
    }
  }

  // Entering a date of birth fills the age in from it, same as the server
  // would compute it — but the field stays this form's to edit either way,
  // so a manual correction or a patient with no birth date on file both work.
  function setDob(value) {
    setForm((current) => ({
      ...current,
      dob: value,
      age: value ? calcAge(value) : current.age,
    }));
  }

  const nameError = !form.name.trim() ? "A name is required." : "";
  const phoneError = !form.phone
    ? "A phone number is required."
    : isPhoneIncomplete(form.phone)
      ? PHONE_ERROR
      : "";
  const ageError =
    form.age === ""
      ? "Age is required — give a date of birth or type one in."
      : Number(form.age) < 0 || Number(form.age) > 130
        ? "Age must be between 0 and 130."
        : "";
  const blocked = Boolean(nameError || phoneError || ageError);

  async function handleSubmit(e) {
    e.preventDefault();
    // Pressing the button is the moment the whole form becomes fair to judge,
    // so anything still missing says so now — fields never visited included.
    setAttempted(true);
    if (blocked) return;
    setSaving(true);
    setErrorMsg("");

    // Only what was actually filled in. Sending empty strings for every
    // untouched field would overwrite a stored value with nothing on an edit.
    const payload = {};
    for (const [key, value] of Object.entries(form)) {
      const cleaned = typeof value === "string" ? value.trim() : value;
      if (cleaned !== "" && cleaned != null) payload[key] = cleaned;
      else if (isEdit) payload[key] = null;
    }
    // The date of birth wins server-side whenever both are on file (see
    // `Patient.age`), so a typed age is only ever meaningful without one.
    if (form.dob) delete payload.age;
    if (!isEdit) {
      // Always the walk-in: the desk registers the person in front of them,
      // so they join today's queue as soon as the record exists.
      payload.book_now = true;
    }

    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message ||
          `Could not ${isEdit ? "save the changes" : "register this patient"}.`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? `Edit ${patient.name}` : "Register a patient"} onClose={onClose} wide>
      {/* `noValidate` leaves validation to the messages below. The browser's
          own bubbles would fire on the first press and stop `handleSubmit`
          from running at all, so the form could never reveal the rest. */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5 pb-1">
        <section>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Who they are
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" error={shown("name", nameError)} className="sm:col-span-2">
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => touch("name")}
                autoFocus
                required
                aria-invalid={Boolean(shown("name", nameError))}
                className={shown("name", nameError) ? INPUT_INVALID : INPUT}
              />
            </Field>

            <Field label="Gender">
              <select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
                className={INPUT}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>

            <Field label="Date of birth" hint="Fills the age in below, if given">
              <input
                type="date"
                value={form.dob}
                max={todayISO()}
                onChange={(e) => setDob(e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field
              label="Age"
              error={shown("age", ageError)}
              hint={form.dob ? "Calculated from the date of birth — you can adjust it" : undefined}
            >
              <input
                type="number"
                min="0"
                max="130"
                required
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                onBlur={() => touch("age")}
                aria-invalid={Boolean(shown("age", ageError))}
                className={shown("age", ageError) ? INPUT_INVALID : INPUT}
              />
            </Field>

            <Field label="Blood group">
              <select
                value={form.blood_group}
                onChange={(e) => set("blood_group", e.target.value)}
                className={INPUT}
              >
                <option value="">Select</option>
                {BLOOD_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Phone number" error={shown("phone", phoneError)}>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                required
                placeholder={`${PHONE_DIGITS}-digit mobile number`}
                value={form.phone}
                onChange={(e) => set("phone", digitsOnly(e.target.value))}
                onBlur={() => touch("phone")}
                aria-invalid={Boolean(shown("phone", phoneError))}
                className={shown("phone", phoneError) ? INPUT_INVALID : INPUT}
              />
            </Field>

            <Field label="Address" className="sm:col-span-2">
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className={`${INPUT} resize-none`}
              />
            </Field>
          </div>
        </section>

        {/* Edit only: this is for a patient who already exists, registered
            without "Is the patient here?" — booked by phone, most often —
            and who has now walked in. Not an alternative to that checkbox;
            it is what the desk reaches for afterwards, once, whenever the
            patient actually arrives. */}
        {isEdit && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <HiOutlineQueueList className="h-5 w-5 text-brand-600" />
              <h3 className="text-sm font-semibold text-slate-900">Today&rsquo;s queue</h3>
            </div>

            {queueState ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5">
                <span className="text-sm text-slate-700">
                  {queueState.status === "in_progress"
                    ? "With the doctor now"
                    : `Already in queue — Queue #${queueState.queue_number}`}
                </span>
                <StatusBadge status={queueState.status} />
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  Has {patient?.name || "the patient"} arrived? Add them to today&rsquo;s
                  queue — the next queue number is assigned automatically.
                </p>
                <button
                  type="button"
                  onClick={handleGenerateQueue}
                  disabled={generatingQueue}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <HiOutlineQueueList className="h-4.5 w-4.5" />
                  {generatingQueue ? "Adding…" : "Generate Queue"}
                </button>
              </>
            )}

            {queueMsg && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                {queueMsg}
              </p>
            )}
          </section>
        )}

        {errorMsg && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          {/* Live even while something is missing: a greyed-out button that
              never says why is a dead end, whereas pressing this one names the
              fields still needed. `handleSubmit` is what stops the save. */}
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Register and add to queue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
