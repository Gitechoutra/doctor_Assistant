import { useEffect, useState } from "react";
import { HiOutlineCheckCircle } from "react-icons/hi2";
import { usePortalAuth } from "../../context/PortalAuthContext";
import { updateMe } from "../../services/portalService";
import doctorName from "../../utils/doctorName";

/**
 * The patient's own details.
 *
 * Contact only, and the page says why rather than leaving the reader to
 * wonder where the rest of their record is: allergies, conditions and history
 * are clinical entries the doctor makes and reads before prescribing, so they
 * are corrected in the consulting room, not on a form. The server enforces the
 * same split — a payload with `allergies` in it is ignored, not honoured.
 */

const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-600">{label}</p>
      <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
        {value || "—"}
      </p>
    </div>
  );
}

export default function PortalProfile() {
  const { patient, updatePatient, refresh } = usePortalAuth();

  const [form, setForm] = useState({
    phone: "",
    address: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(false);

  // Re-read on mount, so details the desk corrected show here rather than
  // whatever the cached copy said at sign-in.
  useEffect(() => {
    refresh().catch(() => {
      /* the cached copy stays on screen; the form still works */
    });
  }, [refresh]);

  useEffect(() => {
    if (!patient) return;
    setForm({
      phone: patient.phone || "",
      address: patient.address || "",
      emergency_contact_name: patient.emergency_contact_name || "",
      emergency_contact_phone: patient.emergency_contact_phone || "",
    });
  }, [patient]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      updatePatient(await updateMe(form));
      setSaved(true);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not save your details."
      );
    } finally {
      setSaving(false);
    }
  }

  const myDoctor = doctorName(patient?.doctor?.name, { fallback: "—" });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">My details</h1>
        <p className="mt-1 text-sm text-slate-500">
          Keep your contact details up to date so the practice can reach you.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          Held by the practice
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          To correct any of these, please speak to the practice.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ReadOnly label="Name" value={patient?.name} />
          <ReadOnly label="Patient ID" value={patient?.code} />
          <ReadOnly
            label="Date of birth"
            value={
              patient?.dob
                ? new Date(patient.dob).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : patient?.age
                  ? `Age ${patient.age}`
                  : null
            }
          />
          <ReadOnly label="Your doctor" value={myDoctor} />
          <ReadOnly label="Sign-in email" value={patient?.email} />
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-800">
          Details you can change
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" hint="10 digits, no spaces or symbols">
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={10}
              className={INPUT}
            />
          </Field>

          <Field label="Address">
            <input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className={INPUT}
            />
          </Field>

          <Field label="Emergency contact">
            <input
              value={form.emergency_contact_name}
              onChange={(e) => set("emergency_contact_name", e.target.value)}
              placeholder="Their name"
              className={INPUT}
            />
          </Field>

          <Field label="Emergency contact number">
            <input
              value={form.emergency_contact_phone}
              onChange={(e) =>
                set("emergency_contact_phone", e.target.value.replace(/\D/g, ""))
              }
              inputMode="numeric"
              maxLength={10}
              className={INPUT}
            />
          </Field>
        </div>

        {errorMsg && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorMsg}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          {saved && !saving && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <HiOutlineCheckCircle className="h-4 w-4" />
              Saved
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <p className="px-1 text-xs text-slate-400">
        Your medical history, allergies and prescriptions are part of your
        clinical record. Your doctor keeps those up to date with you during your
        appointment.
      </p>
    </div>
  );
}
