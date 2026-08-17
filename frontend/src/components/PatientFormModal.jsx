import { useState } from "react";
import Modal from "./Modal";
import { BLOOD_GROUPS } from "../constants/patient";

/**
 * Registering a patient, and correcting one afterwards.
 *
 * One component for both, because they are the same form twice — the fields
 * the desk collects are the fields the desk can fix, and two components would
 * be two places for a field to go missing from. `patient` decides which:
 * absent means a new registration, present means an edit.
 *
 * Who the patient is, and nothing else. Two groups of fields used to sit under
 * this one — what the doctor should know (allergies, conditions, history,
 * notes) and how to reach them (phone, email, address, next of kin) — and both
 * are gone from the form. The desk was being asked to take a clinical history
 * and a full set of contact details across a counter, and a registration
 * nobody can finish in a queue is one that gets finished badly.
 *
 * Every one of those columns still exists, still holds what was recorded
 * before, and is still shown on the patient's record and in the consulting
 * room. `blank()` below is the whole of what this form touches, and it has to
 * keep the rest out of the *payload* and not merely off the screen — an edit
 * writes an explicit null for anything it sends empty, so a field left in by
 * accident would erase a phone number rather than ignore it.
 *
 * Age, not date of birth. Most patients at a private practice know their age
 * and not their birth date; asking for the date produced records full of
 * invented 1st-of-January birthdays. `patients.dob` is still read wherever it
 * was already set — `Patient.age` prefers it and counts the years — so a
 * record that has one keeps it, and this form simply never sets one.
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
    age: "",
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

  const nameError = !form.name.trim() ? "A name is required." : "";
  const blocked = Boolean(nameError);

  // A record registered before this form stopped asking for a birth date has
  // one, and `Patient.age` counts from it — so its age is not this form's to
  // set. Shown, and left alone: typing over a derived age would either be
  // ignored or quietly contradict the date it was derived from.
  const ageFromDob = isEdit && Boolean(patient.dob);

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
    if (ageFromDob) delete payload.age;
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
              label="Age"
              hint={ageFromDob ? "Taken from the date of birth on file" : undefined}
            >
              <input
                type="number"
                min="0"
                max="130"
                value={form.age}
                disabled={ageFromDob}
                onChange={(e) => set("age", e.target.value)}
                className={`${INPUT} disabled:bg-slate-50 disabled:text-slate-400`}
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
