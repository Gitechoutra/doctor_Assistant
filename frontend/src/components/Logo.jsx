import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";

export default function Logo({ subtitle = "AI Medical Assistant", className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">
        <HiOutlineChatBubbleLeftRight className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-base font-bold text-slate-900">Yasodha</p>
        {subtitle && <p className="text-[11px] font-medium text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}
