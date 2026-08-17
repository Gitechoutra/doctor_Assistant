import { useState } from "react";
import Modal from "./Modal";
import { BLOOD_GROUPS } from "../constants/patient";
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
    reason: "",
    book_now: false,
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

export default function PatientFormModal({ patient, onClose, onSave }) {
  const isEdit = Boolean(patient);
  const [form, setForm] = useState(() => (patient ? fromPatient(patient) : blank()));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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
    if (blocked) return;
    setSaving(true);
    setErrorMsg("");

    // Only what was actually filled in. Sending empty strings for every
    // untouched field would overwrite a stored value with nothing on an edit.
    const payload = {};
    for (const [key, value] of Object.entries(form)) {
      if (key === "book_now" || key === "reason") continue;
      const cleaned = typeof value === "string" ? value.trim() : value;
      if (cleaned !== "" && cleaned != null) payload[key] = cleaned;
      else if (isEdit) payload[key] = null;
    }
    // The date of birth wins server-side whenever both are on file (see
    // `Patient.age`), so a typed age is only ever meaningful without one.
    if (form.dob) delete payload.age;
    if (!isEdit) {
      payload.book_now = form.book_now;
      if (form.book_now && form.reason.trim()) payload.reason = form.reason.trim();
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
      <form onSubmit={handleSubmit} className="space-y-5 pb-1">
        <section>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Who they are
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" error={nameError} className="sm:col-span-2">
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                autoFocus
                required
                className={INPUT}
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
              error={ageError}
              hint={form.dob ? "Calculated from the date of birth — you can adjust it" : undefined}
            >
              <input
                type="number"
                min="0"
                max="130"
                required
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                className={INPUT}
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

            <Field label="Phone number" error={phoneError}>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                required
                placeholder={`${PHONE_DIGITS}-digit mobile number`}
                value={form.phone}
                onChange={(e) => set("phone", digitsOnly(e.target.value))}
                className={INPUT}
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

        {!isEdit && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.book_now}
                onChange={(e) => set("book_now", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-700">
                  They are here now
                </span>
                <span className="block text-xs text-slate-500">
                  Adds them to today&rsquo;s queue as soon as they are registered.
                </span>
              </span>
            </label>

            {form.book_now && (
              <div className="mt-3">
                <Field label="Reason for visit">
                  <input
                    value={form.reason}
                    onChange={(e) => set("reason", e.target.value)}
                    className={INPUT}
                  />
                </Field>
              </div>
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
          <button
            type="submit"
            disabled={saving || blocked}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : form.book_now
                  ? "Register and add to queue"
                  : "Register patient"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
