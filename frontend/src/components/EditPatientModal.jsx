import { useState } from "react";
import Modal from "./Modal";
import { BLOOD_GROUPS, isValidBloodGroup } from "../constants/patient";
import { updatePatient } from "../services/patientService";
import {
  EMAIL_ERROR,
  EMAIL_HINT,
  PHONE_DIGITS,
  PHONE_ERROR,
  digitsOnly,
  isPhoneIncomplete,
  isValidEmail,
} from "../utils/contact";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

/**
 * Corrects a patient's registration details.
 *
 * Deliberately has no doctor picker: rerouting a patient is a separate
 * front-desk action with its own control on the Patients table, and the
 * server ignores `assigned_doctor_id` on this route regardless.
 */
export default function EditPatientModal({ patient, onClose, onSaved }) {
  // A record written before this field was a closed list can hold something
  // that is not a blood group at all. Dropping it into the picker would leave
  // a select that *looks* blank while still holding "Z+" — and a save the
  // server would then refuse, for a field the receptionist never touched. It
  // starts empty instead, and the warning below says why.
  const storedBloodGroupInvalid = !isValidBloodGroup(patient.blood_group);

  const [form, setForm] = useState({
    name: patient.name || "",
    gender: patient.gender || "",
    dob: patient.dob || "",
    // Sanitised on the way in, so a number written before the rule existed
    // ("+91 98765 43210") loads as the ten digits it contains rather than into
    // a field that can no longer represent it — which would leave the front
    // desk unable to save the record at all without clearing it first.
    phone: digitsOnly(patient.phone),
    email: patient.email || "",
    blood_group: storedBloodGroupInvalid ? "" : patient.blood_group || "",
    allergies: patient.allergies || "",
    medical_history: patient.medical_history || "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const phoneIncomplete = isPhoneIncomplete(form.phone);
  const emailInvalid = !isValidEmail(form.email);

  async function handleSubmit(e) {
    e.preventDefault();
    if (phoneIncomplete) {
      setErrorMsg(PHONE_ERROR);
      return;
    }
    if (emailInvalid) {
      setErrorMsg(EMAIL_ERROR);
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      onSaved(await updatePatient(patient.id, form));
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save those changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${patient.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {patient.code}
          {patient.assigned_doctor?.name
            ? ` · under ${patient.assigned_doctor.name}`
            : " · not yet routed to a doctor"}
        </p>

        <div>
          <label className={labelClass}>Name *</label>
          <input required className={inputClass} value={form.name} onChange={update("name")} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Date of Birth</label>
            <input
              type="date"
              min={`${new Date().getFullYear() - 130}-01-01`}
              max={new Date().toISOString().slice(0, 10)}
              className={inputClass}
              value={form.dob}
              onChange={update("dob")}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={PHONE_DIGITS}
              placeholder={`${PHONE_DIGITS} digits`}
              className={`${inputClass} ${phoneIncomplete ? "border-red-300" : ""}`}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: digitsOnly(e.target.value) }))}
            />
            {phoneIncomplete && (
              <p className="mt-1 text-xs text-red-600">
                {form.phone.length} of {PHONE_DIGITS} digits
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Gender</label>
            <select className={inputClass} value={form.gender} onChange={update("gender")}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Blood Group</label>
            <select
              className={inputClass}
              value={form.blood_group}
              onChange={update("blood_group")}
            >
              <option value="">Not recorded</option>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            {storedBloodGroupInvalid && !form.blood_group && (
              <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This record holds “{patient.blood_group}”, which is not a blood group.
                Pick the correct one, or save to clear it.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            placeholder={EMAIL_HINT}
            className={`${inputClass} ${emailInvalid ? "border-red-300" : ""}`}
            value={form.email}
            onChange={update("email")}
          />
          {emailInvalid && <p className="mt-1 text-xs text-red-600">{EMAIL_ERROR}</p>}
        </div>
        <div>
          <label className={labelClass}>Allergies</label>
          <input className={inputClass} value={form.allergies} onChange={update("allergies")} />
        </div>
        <div>
          <label className={labelClass}>Medical History</label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.medical_history}
            onChange={update("medical_history")}
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving || phoneIncomplete || emailInvalid}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Modal>
  );
}
