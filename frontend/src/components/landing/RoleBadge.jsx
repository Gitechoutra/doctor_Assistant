/**
 * Who does this step: the PA, the doctor, or both.
 *
 * The three are told apart by tint and weight rather than by hue. A second
 * colour here would read as a status — warning, success — which none of these
 * three are, and the page keeps to one accent on purpose.
 */
const ROLE_STYLES = {
  PA: { chip: "bg-brand-50 text-brand-700 ring-brand-100", dot: "bg-brand-500" },
  Doctor: { chip: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-600" },
  Both: { chip: "bg-white text-slate-500 ring-slate-200", dot: "bg-brand-300" },
};

export default function RoleBadge({ who, size = "md" }) {
  const style = ROLE_STYLES[who] ?? ROLE_STYLES.Both;
  const scale =
    size === "sm"
      ? "px-2 py-0.5 text-[9px] tracking-[0.1em]"
      : "px-2.5 py-1 text-[10px] tracking-[0.12em]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase ring-1 ring-inset ${scale} ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {who}
    </span>
  );
}
