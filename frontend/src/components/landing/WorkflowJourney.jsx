import { useRef } from "react";
import { m, useReducedMotion, useScroll, useSpring } from "framer-motion";
import Reveal from "./Reveal";
import RoleBadge from "./RoleBadge";

/**
 * The visit, as one continuous read rather than six boxes.
 *
 * Two earlier attempts at this section both reached for cards — an alternating
 * timeline, then a grid of six. Six equally-weighted rounded rectangles say
 * "six features"; a visit is one thing that happens in an order, so the
 * structure here is editorial: a single hairline running the length of the
 * section, numbered marks sitting on it, and each stage separated by a rule
 * and a lot of air rather than by a border on four sides.
 *
 * The one exception is the final stage. It is where the whole page is going —
 * the shared record — so it gets a soft lavender field to rest on. That is the
 * only background in the section, which is what makes it read as an ending.
 *
 * The hairline fills in as the section scrolls. It is the one scroll-driven
 * animation on the page, and it earns it: the line *is* the claim that these
 * six things are one sequence.
 */
export default function WorkflowJourney({ steps }) {
  const trackRef = useRef(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start 80%", "end 75%"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 24, mass: 0.4 });

  return (
    <div ref={trackRef} className="relative mx-auto max-w-4xl pl-11 sm:pl-14">
      {/* The track and the line that fills it. Both hairlines — the only
          vertical rules in the section. */}
      <span
        aria-hidden="true"
        className="absolute bottom-6 left-4 top-6 w-px bg-slate-200 sm:left-5"
      />
      <m.span
        aria-hidden="true"
        style={{ scaleY: reduced ? 1 : progress }}
        className="absolute bottom-6 left-4 top-6 w-px origin-top bg-brand-400/70 sm:left-5"
      />

      <ol>
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.title}
              className={`relative border-t border-slate-100 first:border-t-0 ${
                isLast ? "mt-2 rounded-3xl bg-brand-50/50 px-5 py-7 sm:px-8 sm:py-9" : "py-7 sm:py-8"
              }`}
            >
              {/* The mark on the line. Sits over the rule, on white, so the
                  hairline appears to pass behind it. */}
              <span
                aria-hidden="true"
                // -left-7 against the container's pl-11 puts the centre at
                // 16px, exactly on the rail; -left-9 does the same against
                // pl-14 at `sm`. The last stage's padding is inside its own
                // box, so the same offsets still land on the line.
                className={`absolute -left-7 top-8 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full text-[10px] font-bold tabular-nums sm:-left-9 sm:top-9 ${
                  isLast
                    ? "bg-brand-600 text-white shadow-[0_6px_14px_-6px_rgba(51,43,113,0.8)]"
                    : "bg-white text-brand-600 ring-1 ring-brand-100"
                }`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <Reveal delay={index * 0.05}>
                <div className="sm:grid sm:grid-cols-12 sm:items-baseline sm:gap-x-8">
                  <div className="sm:col-span-5">
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-5 w-5 shrink-0 text-brand-500" />
                      <h3 className="text-lg font-bold tracking-tight text-slate-900">
                        {step.title}
                      </h3>
                    </div>
                    <div className="mt-3">
                      <RoleBadge who={step.who} />
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-slate-500 sm:col-span-7 sm:mt-0 sm:text-base">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
