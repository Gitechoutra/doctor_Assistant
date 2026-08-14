/**
 * A prescription written for the person who has to give it.
 *
 * Both things a nurse reads as "the prescription" render through here — the
 * consultation's prescription lines and the medication orders on the nursing
 * schedule — because they carry the same fields and a nurse should not have
 * to learn two layouts for the same information.
 *
 * Deliberately not a table. The fields (medicine, route, dose, frequency,
 * duration, doses/day, instructions) do not fit a phone or a ward tablet in
 * seven columns: they either scroll sideways out of view or collapse into an
 * unlabelled run like "4 · twice · 3", which is exactly the reading that made
 * an emergency prescription unusable. Every value here is labelled, and a
 * field the doctor left blank says so rather than showing a bare dash that
 * could be read as "none".
 */

import { HiOutlineExclamationTriangle } from "react-icons/hi2";

export const TONES = {
  emergency: {
    card: "border-red-200 bg-red-50/40",
    name: "text-red-900",
    label: "text-red-500",
    value: "text-red-950",
    chip: "bg-red-100 text-red-700",
    instruction: "border-red-200 bg-white text-red-900",
  },
  normal: {
    card: "border-slate-200 bg-white",
    name: "text-slate-900",
    label: "text-slate-400",
    value: "text-slate-800",
    chip: "bg-slate-100 text-slate-600",
    instruction: "border-amber-200 bg-amber-50 text-amber-900",
  },
};

// The three the doctor writes on every prescription, in the order a nurse
// says them: how much, how often, for how long.
const FIELDS = [
  { key: "dose", label: "Dose" },
  { key: "frequency", label: "Frequency" },
  { key: "duration", label: "Duration" },
];

function Field({ label, value, tone }) {
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-medium ${value ? tone.value : "text-slate-400"}`}>
        {value || "Not specified"}
      </p>
    </div>
  );
}

/**
 * The dosing line — how much, how often, for how long, how many a day.
 *
 * Exported because the medication schedule renders the same four values with
 * a Log-dose control beside them: one definition, so the schedule and the
 * prescription a nurse cross-checks it against can never word it differently.
 */
export function DoseFields({ item, tone, className = "" }) {
  // Only a nursing medication order counts doses per day. A consultation
  // prescription line has no such field, and defaulting it to "as needed"
  // there would invent an instruction the doctor never wrote — the opposite
  // of what a medicine reading "Twice daily" says.
  const hasPerDay = "times_per_day" in item;
  const perDay = item.times_per_day;

  return (
    <div
      className={`grid gap-x-4 gap-y-3 ${
        hasPerDay ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"
      } ${className}`}
    >
      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label} value={item[f.key]} tone={tone} />
      ))}
      {hasPerDay && (
        <Field
          label="Per day"
          // Blank means as-needed, which is a real instruction, not a gap —
          // it is why the schedule never reports this medicine as behind.
          value={perDay ? `${perDay} ${perDay === 1 ? "dose" : "doses"}` : "As needed (PRN)"}
          tone={tone}
        />
      )}
    </div>
  );
}

/** The doctor's directions for giving it, which must not be skimmable past. */
export function DoseInstructions({ item, tone, className = "" }) {
  const instructions = item.instructions || item.usage_instructions;
  if (!instructions) return null;
  return (
    <p
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${tone.instruction} ${className}`}
    >
      <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="font-semibold">Instructions: </span>
        {instructions}
      </span>
    </p>
  );
}

function Medicine({ item, tone }) {
  return (
    <div className={`rounded-xl border p-4 ${tone.card}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-base font-semibold ${tone.name}`}>{item.medicine_name}</p>
        {item.route_label && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
            {item.route_label}
          </span>
        )}
        {/* An order the doctor has since stopped stays on the record — the
            doses already logged against it need their context — but must
            never read as something still to be given. */}
        {item.is_active === false && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            Stopped
          </span>
        )}
      </div>

      <DoseFields item={item} tone={tone} className="mt-3" />
      <DoseInstructions item={item} tone={tone} className="mt-3" />

      {/* The doctor's own note on the line — why this drug, what to watch
          for. Only consultation prescriptions carry one. */}
      {item.notes && (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-semibold">Doctor&apos;s note: </span>
          {item.notes}
        </p>
      )}
    </div>
  );
}

export default function PrescriptionList({ items = [], tone = "normal", empty }) {
  if (!items.length) {
    return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <Medicine key={item.id ?? index} item={item} tone={TONES[tone] || TONES.normal} />
      ))}
    </div>
  );
}
