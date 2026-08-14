export default function OpStatusBadge({ status }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;

  const isFree = status === "free";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        isFree ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      OP: {isFree ? "Free" : "Paid"}
    </span>
  );
}
