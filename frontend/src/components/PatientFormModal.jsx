import { useState } from "react";
import Modal from "./Modal";
import { BLOOD_GROUPS } from "../constants/patient";
import {
  EMAIL_ERROR,
  PHONE_ERROR,
  digitsOnly,
  isPhoneIncomplete,
  isValidEmail,
} from "../utils/contact";
import { calculateAge } from "../utils/dob";

/**
 * Registering a patient, and correcting one afterwards.
 *
 * One component for both, because they are the same form twice — the fields
 * the desk collects are the fields the desk can fix, and two components would
 * be two places for a field to go missing from. `patient` decides which:
 * absent means a new registration, present means an edit.
 *
 * Age *or* date of birth, not both. Most patients at a private practice know
 * their age and not their birth date, and forcing a date produced records full
 * of invented 1st-of-January birthdays. The server stores whichever was given
 * and derives `age` from the date when there is one — so a form that asks for
 * the exact value when it is known and accepts the approximate one otherwise
 * is honest about which it holds.
 */

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

function blank() {
  return {
    name: "",
    gender: "",
    dob: "",
    age: "",
    phone: "",
    email: "",
    address: "",
    blood_group: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    allergies: "",
    existing_conditions: "",
    medical_history: "",
    notes: "",
    reason: "",
    book_now: false,
  };
}

function fromPatient(patient) {
  return {
    ...blank(),
    ...patient,
    // Never send both back: the server prefers the date, and a stale age
    // sitting beside a corrected birth date is the contradiction this avoids.
    age: patient.dob ? "" : (patient.age ?? ""),
    gender: patient.gender || "",
    blood_group: patient.blood_group || "",
    dob: patient.dob || "",
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

  const phoneError = isPhoneIncomplete(form.phone) ? PHONE_ERROR : "";
  const emergencyPhoneError = isPhoneIncomplete(form.emergency_contact_phone)
    ? PHONE_ERROR
    : "";
  const emailError = form.email && !isValidEmail(form.email) ? EMAIL_ERROR : "";
  const nameError = !form.name.trim() ? "A name is required." : "";
  const blocked = Boolean(phoneError || emergencyPhoneError || emailError || nameError);

  const derivedAge = form.dob ? calculateAge(form.dob) : null;

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

            <Field
              label="Date of birth"
              hint={derivedAge != null ? `${derivedAge} years old` : "If they know it"}
            >
              <input
                type="date"
                value={form.dob}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set("dob", e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field
              label="Age"
              hint={form.dob ? "Taken from the date of birth" : "If the birth date is unknown"}
            >
              <input
                type="number"
                min="0"
                max="130"
                value={form.dob ? (derivedAge ?? "") : form.age}
                disabled={Boolean(form.dob)}
                onChange={(e) => set("age", e.target.value)}
                className={`${INPUT} disabled:bg-slate-50 disabled:text-slate-400`}
              />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            How to reach them
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Phone" error={phoneError}>
              <input
                inputMode="numeric"
                value={form.phone}
                onChange={(e) => set("phone", digitsOnly(e.target.value))}
                className={INPUT}
              />
            </Field>

            <Field label="Email" error={emailError}>
              <input
                type="text"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field label="Address" className="sm:col-span-2">
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field label="Emergency contact">
              <input
                value={form.emergency_contact_name}
                onChange={(e) => set("emergency_contact_name", e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field label="Emergency contact number" error={emergencyPhoneError}>
              <input
                inputMode="numeric"
                value={form.emergency_contact_phone}
                onChange={(e) => set("emergency_contact_phone", digitsOnly(e.target.value))}
                className={INPUT}
              />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            What the doctor should know
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Allergies"
              hint="Read before anything is prescribed"
              className="sm:col-span-2"
            >
              <textarea
                rows={2}
                value={form.allergies}
                onChange={(e) => set("allergies", e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field label="Existing conditions" hint="Ongoing — diabetes, hypertension">
              <textarea
                rows={3}
                value={form.existing_conditions}
                onChange={(e) => set("existing_conditions", e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field label="Medical history" hint="Past — surgeries, admissions, illnesses">
              <textarea
                rows={3}
                value={form.medical_history}
                onChange={(e) => set("medical_history", e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field
              label="Notes"
              hint="The desk's own — preferences, who accompanies them"
              className="sm:col-span-2"
            >
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className={INPUT}
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
