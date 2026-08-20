import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * A single heartbeat trace, drawn once when it scrolls into view.
 *
 * The only overtly "medical" ornament on the page, and it is deliberately the
 * only one: a page about a clinic does not need stethoscope clip art, but one
 * quiet reference stops the design reading as generic B2B SaaS. It is drawn
 * rather than animated on a loop - a trace that beats forever is decoration
 * competing with the copy beside it, and it would still be beating an hour
 * later on an open tab.
 *
 * `pathLength` is measured after mount because the dash animation needs the
 * real length of the path; hard-coding it breaks the moment the `d` changes.
 */
export default function PulseTrace({ className = "" }) {
  const pathRef = useRef(null);
  const wrapRef = useRef(null);
  const reduced = useReducedMotion();
  const [length, setLength] = useState(0);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (pathRef.current) setLength(pathRef.current.getTotalLength());
  }, []);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || drawn) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setDrawn(true);
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [drawn]);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <svg viewBox="0 0 320 60" fill="none" className="h-14 w-full">
        <path
          ref={pathRef}
          d="M0 38 H86 l9 -22 l11 40 l10 -52 l12 46 l9 -12 H320"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={drawn && !reduced && length ? "animate-trace-draw" : ""}
          style={
            drawn && !reduced && length
              ? { "--trace-length": length }
              : // Before it is in view the trace is hidden rather than shown
                // flat: a straight line that later grows a beat looks like a
                // rendering bug. Reduced motion skips straight to the drawn
                // state instead of hiding it forever.
                { opacity: reduced ? 1 : drawn ? 1 : 0 }
          }
        />
      </svg>
    </div>
  );
}
