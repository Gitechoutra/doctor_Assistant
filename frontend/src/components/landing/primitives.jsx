import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

/**
 * Shared building blocks for the landing page.
 *
 * Every animation here checks `useReducedMotion`, so a visitor who has asked
 * their OS for less movement gets the finished state immediately rather than
 * a slow fade. That is the accessible default, not an afterthought.
 */

/** Fades a block up as it scrolls into view. Runs once — re-animating on every
 *  scroll past is distracting rather than premium. */
export function Reveal({ children, delay = 0, className = "", as = "div" }) {
  const reduced = useReducedMotion();
  const Component = motion[as] || motion.div;

  return (
    <Component
      className={className}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}

/**
 * Counts up to `value` once the number is actually on screen.
 *
 * Driven by requestAnimationFrame against elapsed time rather than a fixed
 * step, so the duration holds regardless of frame rate, and eased so it
 * decelerates instead of stopping dead.
 */
export function CountUp({ value, duration = 1800, suffix = "", className = "" }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView || reduced) return undefined;

    let frame;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutExpo — fast out of the gate, settles gently on the final number.
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, value, duration]);

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

/** The small pill that introduces each section. */
export function SectionBadge({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200/70 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-brand-700">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

/** Centred section heading + supporting line, used by every section so the
 *  vertical rhythm stays identical down the page. */
export function SectionHeading({ badge, badgeIcon, title, highlight, description }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      {badge && <SectionBadge icon={badgeIcon}>{badge}</SectionBadge>}
      <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        {title}{" "}
        {highlight && (
          <span className="bg-gradient-to-r from-brand-500 to-indigo-500 bg-clip-text text-transparent">
            {highlight}
          </span>
        )}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-slate-500">{description}</p>
      )}
    </Reveal>
  );
}

/** Soft colour wash used behind several sections. Pointer-events off so it
 *  never eats a click meant for the content above it. */
export function GlowBackdrop({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full blur-3xl ${className}`}
    />
  );
}
