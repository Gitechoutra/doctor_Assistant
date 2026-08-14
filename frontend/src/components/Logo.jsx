import { HiOutlineHeart } from "react-icons/hi2";

/** The product mark. One component so the name and the strapline are written
 *  once — the login page, the sidebar and the empty states all draw it. */
export default function Logo({
  subtitle = "Smart Practice Management",
  className = "",
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">
        <HiOutlineHeart className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-base font-bold text-slate-900">MediAssist AI</p>
        {subtitle && <p className="text-[11px] font-medium text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}
