import { useEffect, useState } from "react";
import Modal from "../Modal";
import { createStaff, updateStaff } from "../../services/staffService";
import {
  EMAIL_ERROR,
  EMAIL_HINT,
  PHONE_DIGITS,
  PHONE_ERROR,
  digitsOnly,
  isPhoneIncomplete,
  isValidEmail,
} from "../../utils/contact";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const label = "mb-1 block text-xs font-semibold text-slate-600";

export const ROLE_LABELS = {
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
  pharmacist: "Pharmacist",
  lab_technician: "Lab Technician",
  accountant: "Accountant",
  other_staff: "Other Staff",
};

/**
 * Which extra fields each role shows.
 *
 * One table rather than conditionals scattered through the JSX: when the
 * hospital tells us what they actually collect, this is the object that
 * changes, and the form re-renders itself.
 */
const ROLE_FIELDS = {
  // Department is a doctor-only field. It is what the OP queue routes on —
  // an appointment is raised against a department and only a doctor in that
  // department can pick it up — so for a doctor it is operational data the
  // account cannot work without.
  //
  // For every other role it was HR trivia: a receptionist works the front
  // desk, a pharmacist is scoped by branch, and an accountant belongs to no
  // clinical department at all. Nothing read those values.
  doctor: ["department", "specialization", "designation", "registration_no", "years_experience"],
  nurse: ["designation", "registration_no"],
  receptionist: [],
  pharmacist: ["branch", "designation", "registration_no"],
  lab_technician: ["lab_department", "qualification", "designation"],
  accountant: ["designation", "qualification"],
  other_staff: ["designation"],
};

// Fields the server refuses to create the account without, because the role's
// operational profile cannot exist otherwise.
// Nurse is deliberately absent: `nurses.department_id` is nullable, the only
// query that filters on it passes the department optionally (and no caller
// ever does), and POST /nursing/nurses has always created nurses without one.
// Requiring it here was stricter than the rest of the application.
//
// The phone and email rules themselves live in utils/contact.js, shared with
// every other form that collects either — the server is the boundary, and
// these are what stop the administrator finding out only when they press Save.

const REQUIRED_BY_ROLE = { doctor: ["department"], pharmacist: ["branch"] };

const REGISTRATION_LABELS = {
  doctor: "Medical registration number",
  nurse: "Nursing registration number",
  pharmacist: "Pharmacy license number",
};

// No password here, and no username either. Both are the server's to decide:
// the username is derived from the full name (Sandeep Viswanadh ->
// sandeep.viswanadh, numbered if taken) and the first password is random and
// emailed to the staff member with a single-use link to replace it. An
// administrator who could type a password would be an administrator who knows
// one, which is the thing that flow exists to prevent — so the field is gone
// rather than hidden.
const EMPTY = {
  name: "",
  email: "",
  role: "",
  phone: "",
  gender: "",
  date_of_birth: "",
  joined_on: "",
  department_id: "",
  branch_id: "",
  designation: "",
  employee_code: "",
  registration_no: "",
  specialization: "",
  years_experience: "",
  lab_department: "",
  qualification: "",
  notes: "",
  is_active: true,
};

export default function StaffFormModal({ staff, options, onClose, onSaved }) {
  const editing = Boolean(staff);

  const [form, setForm] = useState(() => {
    if (!staff) return EMPTY;
    const p = staff.profile || {};
    return {
      ...EMPTY,
      name: staff.name || "",
      email: staff.email || "",
      role: staff.role || "",
      is_active: staff.is_active,
      // Sanitised on the way in too. No stored number currently breaks the
      // rule, but one written before it existed would otherwise load into a
      // field that can no longer represent it — leaving the admin unable to
      // save the record at all without first clearing a number they may have
      // wanted to keep.
      phone: digitsOnly(p.phone),
      gender: p.gender || "",
      date_of_birth: p.date_of_birth || "",
      joined_on: p.joined_on || "",
      department_id: p.department_id || "",
      branch_id: p.branch_id || "",
      designation: p.designation || "",
      employee_code: p.employee_code || "",
      registration_no: p.registration_no || "",
      specialization: p.specialization || "",
      years_experience: p.years_experience ?? "",
      lab_department: p.lab_department || "",
      qualification: p.qualification || "",
      notes: p.notes || "",
    };
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const update = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const shown = ROLE_FIELDS[form.role] || [];
  const required = REQUIRED_BY_ROLE[form.role] || [];
  const designations = options.designations?.[form.role] || [];

  // Clear fields that no longer apply when the role changes, so a doctor's
  // specialization cannot be silently saved against an accountant.
  useEffect(() => {
    if (!form.role) return;
    const keep = new Set(ROLE_FIELDS[form.role] || []);
    setForm((f) => ({
      ...f,
      specialization: keep.has("specialization") ? f.specialization : "",
      years_experience: keep.has("years_experience") ? f.years_experience : "",
      lab_department: keep.has("lab_department") ? f.lab_department : "",
      qualification: keep.has("qualification") ? f.qualification : "",
      registration_no: keep.has("registration_no") ? f.registration_no : "",
      department_id: keep.has("department") ? f.department_id : "",
      branch_id: keep.has("branch") ? f.branch_id : "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role]);

  // Optional, but exact when given: a half-typed number is not "nearly valid",
  // it is a number that would reach the wrong person.
  const phoneIncomplete = isPhoneIncomplete(form.phone);

  // This address is where the account's credentials are sent, so it being at a
  // domain the hospital accepts is not a formality — a typo'd one produces an
  // account whose only way in is a mail that goes nowhere.
  const emailInvalid = !isValidEmail(form.email);

  // Trivial to compute and `required` is rebuilt each render anyway, so a
  // memo here would cost more than it saves.
  const missing = required.filter((r) =>
    r === "department" ? !form.department_id : r === "branch" ? !form.branch_id : false
  );

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
      if (editing) {
        await updateStaff(staff.id, form);
        onSaved();
      } else {
        // The created record carries `credentials` and the message written
        // for the administrator — whether the email went, and the sign-in
        // details themselves if it didn't. Handed up so the staff list can
        // show them; there is no second chance to read them.
        const created = await createStaff(form);
        onSaved(created);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save this staff member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${staff.name}` : "Add staff member"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={label}>Role *</label>
          <select required className={input} value={form.role} onChange={update("role")}>
            <option value="">Select a role</option>
            {(options.roles || []).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </option>
            ))}
          </select>
          {editing && staff.has_records && (
            <p className="mt-1 text-[11px] text-amber-600">
              This account has clinical records — its role cannot be changed.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Full name *</label>
            <input required className={input} value={form.name} onChange={update("name")} />
          </div>
          <div>
            <label className={label}>Email *</label>
            <input
              required
              type="email"
              className={`${input} ${emailInvalid ? "border-red-300" : ""}`}
              placeholder={EMAIL_HINT}
              value={form.email}
              onChange={update("email")}
            />
            <p className={`mt-1 text-xs ${emailInvalid ? "text-red-600" : "text-slate-400"}`}>
              {emailInvalid ? EMAIL_ERROR : `Must be ${EMAIL_HINT}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Mobile number</label>
            <input
              type="tel"
              // inputMode gets a phone keypad on mobile; the value is still
              // sanitised on the way in, because a keypad is a suggestion and
              // paste ignores it entirely.
              inputMode="numeric"
              autoComplete="tel"
              maxLength={PHONE_DIGITS}
              placeholder={`${PHONE_DIGITS} digits`}
              className={`${input} ${phoneIncomplete ? "border-red-300" : ""}`}
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: digitsOnly(e.target.value) }))
              }
            />
            {phoneIncomplete && (
              <p className="mt-1 text-xs text-red-600">
                {form.phone.length} of {PHONE_DIGITS} digits
              </p>
            )}
          </div>
          <div>
            <label className={label}>Gender</label>
            <select className={input} value={form.gender} onChange={update("gender")}>
              <option value="">Select</option>
              {(options.genders || []).map((g) => (
                <option key={g} value={g} className="capitalize">
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Date of birth</label>
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              className={input}
              value={form.date_of_birth}
              onChange={update("date_of_birth")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Employee code</label>
            <input
              className={input}
              value={form.employee_code}
              onChange={update("employee_code")}
              placeholder="Optional — reserved for hospital IDs"
            />
          </div>
          <div>
            <label className={label}>Joined on</label>
            <input
              type="date"
              className={input}
              value={form.joined_on}
              onChange={update("joined_on")}
            />
          </div>
        </div>

        {/* Everything below depends on the role selected above. */}
        {/* Only when the role actually adds fields. Receptionist now adds
            none, and a "Receptionist details" heading over an empty box
            reads as something failing to load. */}
        {form.role && shown.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {ROLE_LABELS[form.role]} details
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.includes("department") && (
                <div>
                  <label className={label}>
                    Department {required.includes("department") ? "*" : ""}
                  </label>
                  <select
                    className={input}
                    value={form.department_id}
                    onChange={update("department_id")}
                  >
                    <option value="">Select a department</option>
                    {(options.departments || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {shown.includes("branch") && (
                <div>
                  <label className={label}>
                    Branch {required.includes("branch") ? "*" : ""}
                  </label>
                  <select
                    className={input}
                    value={form.branch_id}
                    onChange={update("branch_id")}
                  >
                    <option value="">Select a branch</option>
                    {(options.branches || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {shown.includes("designation") && (
                <div>
                  <label className={label}>Designation</label>
                  {designations.length > 0 ? (
                    <select
                      className={input}
                      value={form.designation}
                      onChange={update("designation")}
                    >
                      <option value="">Select</option>
                      {designations.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={input}
                      value={form.designation}
                      onChange={update("designation")}
                    />
                  )}
                </div>
              )}

              {shown.includes("specialization") && (
                <div>
                  <label className={label}>Specialization</label>
                  <input
                    className={input}
                    value={form.specialization}
                    onChange={update("specialization")}
                    placeholder="e.g. Orthopedic Surgeon"
                  />
                </div>
              )}

              {shown.includes("registration_no") && (
                <div>
                  <label className={label}>
                    {REGISTRATION_LABELS[form.role] || "Registration number"}
                  </label>
                  <input
                    className={input}
                    value={form.registration_no}
                    onChange={update("registration_no")}
                  />
                </div>
              )}

              {shown.includes("years_experience") && (
                <div>
                  <label className={label}>Years of experience</label>
                  <input
                    type="number"
                    min="0"
                    max="70"
                    className={input}
                    value={form.years_experience}
                    onChange={update("years_experience")}
                  />
                </div>
              )}

              {shown.includes("lab_department") && (
                <div>
                  <label className={label}>Lab department</label>
                  <input
                    className={input}
                    value={form.lab_department}
                    onChange={update("lab_department")}
                    placeholder="e.g. Pathology, Radiology"
                  />
                </div>
              )}

              {shown.includes("qualification") && (
                <div>
                  <label className={label}>Qualification</label>
                  <input
                    className={input}
                    value={form.qualification}
                    onChange={update("qualification")}
                    placeholder="e.g. B.Sc MLT"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={update("is_active")}
            className="h-4 w-4 rounded border-slate-300"
          />
          Account active — an inactive account cannot sign in
        </label>

        <div>
          <label className={label}>Notes</label>
          <textarea
            rows={2}
            className={input}
            value={form.notes}
            onChange={update("notes")}
          />
        </div>

        {missing.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A {ROLE_LABELS[form.role]} needs a {missing.join(" and ")} before the account
            can be created.
          </p>
        )}
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving || phoneIncomplete || emailInvalid || missing.length > 0}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving
            ? "Saving…"
            : editing
            ? "Save changes"
            : "Create account & email sign-in details"}
        </button>
      </form>
    </Modal>
  );
}
