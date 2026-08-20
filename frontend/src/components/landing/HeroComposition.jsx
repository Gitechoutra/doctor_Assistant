import { m } from "framer-motion";
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheck,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentChartBar,
  HiOutlineQueueList,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import { useTilt } from "./motion3d";

/**
 * The hero visual: one patient's record, and the practice around it.
 *
 * An earlier version of this drew every stage as its own white card — five of
 * them stacked, plus two floating pills. Seven rectangles of identical weight
 * read as a dashboard, not as a product: nothing was primary, so nothing was
 * legible at a glance. This version spends its ink unevenly on purpose:
 *
 *     the record        one full-width panel, nearest the viewer   — primary
 *     queue, script     two narrow panels, set to opposite sides   — secondary
 *     the two people    icon and type on bare background           — supporting
 *
 * Everything is laid out in normal flow with generous gaps and alternating
 * alignment, so elements cannot overlap at any width — the earlier absolute
 * positioning is what let badges land on top of card text. Depth comes from Z
 * position alone: the connector thread sits at 0 and the panels above it, so
 * the thread can never be drawn across a panel face.
 *
 * It is a diagram, not a screenshot. The rows inside the record panel name
 * things the record actually holds; there are no invented patients or numbers.
 */

/** A stage carried by type and an icon, with no box around it. */
function StageNote({ icon: Icon, title, meta, align = "start" }) {
  const right = align === "end";

  return (
    <div
      className={`flex items-center gap-3 ${right ? "self-end flex-row-reverse text-right" : "self-start"}`}
      style={{ transform: "translateZ(14px)" }}
    >
      <Icon className="h-5 w-5 shrink-0 text-brand-500" />
      <div>
        <p className="text-sm font-bold leading-tight text-slate-800">{title}</p>
        <p className="text-[11px] leading-tight text-slate-400">{meta}</p>
      </div>
    </div>
  );
}

/** A muted bar standing in for a line of the record. */
function Line({ width }) {
  return <span className={`block h-1.5 rounded-full bg-slate-100 ${width}`} />;
}

export default function HeroComposition() {
  const { ref, style, handlers } = useTilt({ max: 3.5, baseX: 3, baseY: -6 });

  return (
    <div
      ref={ref}
      {...handlers}
      className="relative mx-auto w-full max-w-[19rem] sm:max-w-[21rem]"
      style={{ perspective: 1600 }}
    >
      {/* A wash rather than a border: it gives the composition a centre of
          gravity without adding another edge to the page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-[3rem] bg-brand-50/60 blur-2xl sm:-inset-8"
      />

      <m.div style={style} className="relative flex flex-col gap-5 sm:gap-6">
        {/* The thread, on the base plane and therefore behind every panel. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ transform: "translateZ(0px)" }}
          viewBox="0 0 100 160"
          preserveAspectRatio="none"
        >
          <path
            d="M20 8 C 20 44, 80 46, 80 82 C 80 116, 26 112, 26 152"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
            className="animate-dash-flow text-brand-200"
          />
        </svg>

        <StageNote icon={HiOutlineUserPlus} title="Patient registered" meta="By the PA, once" />

        {/* Secondary — the queue. Narrow, and pushed left. */}
        <div
          className="w-[68%] self-start rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_16px_32px_-24px_rgba(51,43,113,0.5)] sm:w-[62%] sm:p-3.5"
          style={{ transform: "translateZ(34px)" }}
        >
          <div className="flex items-center gap-2">
            <HiOutlineQueueList className="h-4 w-4 text-brand-500" />
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Queue</p>
          </div>
          <ol className="mt-3 space-y-2">
            {["w-full", "w-4/5", "w-3/5"].map((width, index) => (
              <li key={width} className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold tabular-nums text-brand-400">
                  {index + 1}
                </span>
                <Line width={`flex-1 ${width}`} />
              </li>
            ))}
          </ol>
        </div>

        <StageNote
          icon={HiOutlineChatBubbleLeftRight}
          title="Doctor consults"
          meta="Recorded, then summarised"
          align="end"
        />

        {/* Secondary — the prescription, with its status annotation. */}
        <div className="w-[72%] self-end sm:w-[66%]" style={{ transform: "translateZ(34px)" }}>
          <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_16px_32px_-24px_rgba(51,43,113,0.5)] sm:p-3.5">
            <div className="flex items-center gap-2">
              <HiOutlineClipboardDocumentList className="h-4 w-4 text-brand-500" />
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
                Prescription
              </p>
            </div>
            <div className="mt-3 space-y-2">
              <Line width="w-full" />
              <Line width="w-2/3" />
            </div>
          </div>

          {/* An annotation, not a card: no border, no shadow, no panel. */}
          <p
            className="animate-card-drift mt-2.5 inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold text-brand-700"
            style={{ animationDelay: "1.4s", animationDuration: "11s" }}
          >
            <HiOutlineCheck className="h-3.5 w-3.5 shrink-0 text-brand-500" />
            Doctor signed
          </p>
        </div>

        {/* Primary — the record everything else feeds. Widest, nearest, and
            the only panel with a drift of its own. */}
        <div style={{ transform: "translateZ(62px)" }}>
          <div
            className="animate-card-drift w-full rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_28px_50px_-28px_rgba(51,43,113,0.55)] sm:p-5"
            style={{ animationDuration: "12s" }}
          >
            <div className="flex items-center gap-2.5">
              <HiOutlineDocumentChartBar className="h-5 w-5 shrink-0 text-brand-600" />
              <p className="text-sm font-bold text-slate-900">Patient record</p>
            </div>

            <ul className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              {["Consultation", "Prescription", "Report"].map((entry, index) => (
                <li key={entry} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 truncate text-[11px] font-semibold text-slate-500">
                    {entry}
                  </span>
                  <Line width={index === 2 ? "flex-1 w-2/3" : "flex-1"} />
                </li>
              ))}
            </ul>
          </div>

          <p
            className="animate-card-drift mt-2.5 inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold text-slate-500"
            style={{ animationDelay: "3.2s", animationDuration: "11s" }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
            One shared record
          </p>
        </div>
      </m.div>
    </div>
  );
}
