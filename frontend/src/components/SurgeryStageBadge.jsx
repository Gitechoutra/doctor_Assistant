// Where a patient stands on the surgical pathway, in one chip.
//
// Nothing is rendered for a patient with no surgery planned — the overwhelming
// majority — so this can be dropped into a list without adding a column of
// dashes. See components/nursing/SurgeryPanel for the pathway itself.
const STAGES = {
  required: ["Surgery required", "bg-amber-100 text-amber-700"],
  post_op: ["Post-op observation", "bg-brand-50 text-brand-700"],
  ready_for_discharge: ["Ready for discharge", "bg-emerald-100 text-emerald-700"],
};

export default function SurgeryStageBadge({ stage, daysLeft = null, className = "" }) {
  const entry = STAGES[stage];
  if (!entry) return null;

  const [label, tone] = entry;
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone} ${className}`}
    >
      {label}
      {stage === "post_op" && daysLeft != null && (
        <span className="ml-1 font-normal opacity-80">
          · {daysLeft}d left
        </span>
      )}
    </span>
  );
}
