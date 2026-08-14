import { useState } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckCircle,
  HiOutlinePrinter,
} from "react-icons/hi2";
import Modal from "./Modal";
import { BLOOD_GROUPS } from "../constants/patient";
import {
  EMAIL_ERROR,
  EMAIL_HINT,
  PHONE_DIGITS,
  PHONE_ERROR,
  digitsOnly,
  isPhoneIncomplete,
  isValidEmail,
} from "../utils/contact";
import { createPatient } from "../services/patientService";
import {
  downloadOpDocument,
  generateOpDocument,
  printOpDocument,
} from "../services/appointmentService";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

const PAYMENT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
];

/**
 * ADD OP: registration, doctor assignment and payment, in one wizard ending
 * in the printable/downloadable OP slip.
 *
 * Only ever rendered for the front desk — see `canRegisterPatient`. Three
 * steps, but one save: the patient and their OP are still created together
 * in a single `createPatient` call (unchanged from the old one-screen form)
 * when "ADD OP" is clicked on the second step — splitting that into two
 * network calls would mean making `assigned_doctor_id` optional on a shared,
 * well-tested endpoint for no real benefit, since nothing here needs the
 * patient to exist independently of their first OP.
 */
export default function AddOpModal({ onClose, onCreated, doctors }) {
  const [step, setStep] = useState("details"); // "details" | "assign" | "created"
  const [form, setForm] = useState({
    name: "",
    gender: "",
    dob: "",
    phone: "",
    email: "",
    blood_group: "",
    allergies: "",
    medical_history: "",
    assigned_doctor_id: "",
    reason: "",
    paid: false,
    payment_type: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [created, setCreated] = useState(null);
  const [docGenerating, setDocGenerating] = useState(false);
  const [docError, setDocError] = useState("");
  const [docReady, setDocReady] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  // Both optional on a patient record — somebody brought in unconscious has
  // neither — but exact when given, and the same rule the staff form uses.
  const phoneIncomplete = isPhoneIncomplete(form.phone);
  const emailInvalid = !isValidEmail(form.email);

  function handleNext(e) {
    e.preventDefault();
    if (phoneIncomplete) {
      setErrorMsg(PHONE_ERROR);
      return;
    }
    if (emailInvalid) {
      setErrorMsg(EMAIL_ERROR);
      return;
    }
    setErrorMsg("");
    setStep("assign");
  }

  async function generateDocument(appointmentId) {
    setDocGenerating(true);
    setDocError("");
    try {
      await generateOpDocument(appointmentId);
      setDocReady(true);
    } catch (err) {
      setDocError(err.response?.data?.message || "Could not generate the OP document.");
    } finally {
      setDocGenerating(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const result = await createPatient({
        ...form,
        payment_type: form.paid ? form.payment_type : undefined,
      });
      setCreated(result);
      setStep("created");
      // The patient and OP are already committed at this point — a failure
      // generating the slip is not treated as the ADD OP action failing, it
      // just leaves the "Retry" button below in place of Download/Print.
      generateDocument(result.appointment.id);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not create this OP.");
    } finally {
      setSaving(false);
    }
  }

  function documentFilename() {
    return `${(created?.name || "patient").replace(/\s+/g, "_")}_OP_${
      created?.appointment?.code || ""
    }.pdf`;
  }

  const titles = {
    details: "ADD OP — Patient Details",
    assign: "ADD OP — Assign Doctor & Payment",
    created: "OP Created",
  };

  return (
    <Modal title={titles[step]} onClose={onClose}>
      {step === "details" && (
        <form onSubmit={handleNext} className="space-y-3">
          <div>
            <label className={labelClass}>Name *</label>
            <input required className={inputClass} value={form.name} onChange={update("name")} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Date of Birth</label>
              {/* Age on the queue cards is derived from this — without it the
                  card can only show a dash. The min stops a mistyped year
                  (e.g. "0001") from producing an absurd age; the server
                  rejects out-of-range dates too. */}
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
              {/* Sanitised as it is typed rather than validated on submit: a
                  pasted "+91 98765 43210" becomes usable instead of an error,
                  and a letter simply cannot be entered. Same rule as the staff
                  form — see utils/contact.js. */}
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
              {/* A picker, not a text box. Typing this field is how "P+" and
                  "Z+" got into the record — there are eight answers and no
                  reason to let anyone write a ninth. Optional: reception often
                  registers a patient before anybody knows it. */}
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
              className={inputClass}
              rows={2}
              value={form.medical_history}
              onChange={update("medical_history")}
            />
          </div>

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

          <button
            type="submit"
            disabled={phoneIncomplete || emailInvalid}
            className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
          >
            Next
          </button>
        </form>
      )}

      {step === "assign" && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={labelClass}>Assign Doctor *</label>
            {/* Chosen from the condition the patient presents with — this is
                also what decides who can see the record afterwards. */}
            <select
              required
              className={inputClass}
              value={form.assigned_doctor_id}
              onChange={update("assigned_doctor_id")}
            >
              <option value="">Select the treating doctor</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.specialization ? ` — ${d.specialization}` : ""}
                  {d.department ? ` (${d.department})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              Only this doctor will be able to see this patient. Saving also puts
              them in this doctor&apos;s queue — no separate OP needed.
            </p>
          </div>

          <div>
            <label className={labelClass}>Reason for visit</label>
            {/* Goes onto the OP this registration raises, which is what the
                doctor sees on the queue card. */}
            <textarea
              className={inputClass}
              rows={2}
              value={form.reason}
              onChange={update("reason")}
              placeholder="e.g. Chest pain since this morning"
            />
          </div>

          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.paid}
              onChange={(e) =>
                setForm((f) => ({ ...f, paid: e.target.checked, payment_type: e.target.checked ? f.payment_type : "" }))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Paid
          </label>

          {form.paid && (
            <div>
              <label className={labelClass}>Payment Type *</label>
              <select
                required
                className={inputClass}
                value={form.payment_type}
                onChange={update("payment_type")}
              >
                <option value="">Select payment type</option>
                {PAYMENT_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("details")}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
            >
              {saving ? "Creating…" : "ADD OP"}
            </button>
          </div>
        </form>
      )}

      {step === "created" && created && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-600">
            <HiOutlineCheckCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">OP created successfully</p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm">
            <div>
              <p className="text-[11px] text-slate-400">Patient</p>
              <p className="font-medium text-slate-800">{created.name}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Patient ID</p>
              <p className="font-medium text-slate-800">{created.code}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">OP Number</p>
              <p className="font-medium text-slate-800">{created.appointment?.code || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Doctor</p>
              <p className="font-medium text-slate-800">
                {created.assigned_doctor?.name || "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Department</p>
              <p className="font-medium text-slate-800">{created.appointment?.department || "—"}</p>
            </div>
          </div>

          {docGenerating && <p className="text-sm text-slate-500">Generating OP document…</p>}

          {docError && (
            <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
              {docError}
              <button
                type="button"
                onClick={() => generateDocument(created.appointment.id)}
                className="ml-2 font-semibold underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {docReady && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadOpDocument(created.appointment.id, documentFilename())}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <HiOutlineArrowDownTray className="h-4 w-4" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => printOpDocument(created.appointment.id, documentFilename())}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <HiOutlinePrinter className="h-4 w-4" />
                Print OP
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onCreated(created)}
            className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
