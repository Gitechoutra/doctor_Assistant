import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/**
 * The landing page's motion primitives.
 *
 * Two rules hold everywhere below. Nothing animates a property that costs
 * layout — transform and opacity only — and every effect switches itself off
 * for a visitor who has asked the OS for reduced motion. Pointer-driven tilt
 * additionally switches off on touch, where there is no cursor to follow and
 * the "hover" state would stick after a tap.
 */

const SPRING = { stiffness: 170, damping: 20, mass: 0.5 };

/** Whether this device has a real cursor. Touch screens report `coarse`. */
export function useFinePointer() {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: fine)");
    const sync = () => setFine(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return fine;
}

/**
 * Pointer-follow tilt.
 *
 * `baseX`/`baseY` are the resting angles, so an element can sit at a fixed
 * three-quarter angle and lean a few degrees further towards the cursor. When
 * tilt is disabled the springs stay parked at the resting angles, which is why
 * the caller can apply the returned style unconditionally.
 */
export function useTilt({ max = 7, baseX = 0, baseY = 0 } = {}) {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  const ref = useRef(null);

  // Cursor position within the element, as -0.5 … 0.5 on each axis.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const rotateX = useSpring(
    useTransform(py, [-0.5, 0.5], [baseX + max, baseX - max]),
    SPRING,
  );
  const rotateY = useSpring(
    useTransform(px, [-0.5, 0.5], [baseY - max, baseY + max]),
    SPRING,
  );

  const enabled = fine && !reduced;

  const onPointerMove = useCallback(
    (event) => {
      if (!enabled || !ref.current) return;
      const box = ref.current.getBoundingClientRect();
      px.set((event.clientX - box.left) / box.width - 0.5);
      py.set((event.clientY - box.top) / box.height - 0.5);
    },
    [enabled, px, py],
  );

  const onPointerLeave = useCallback(() => {
    px.set(0);
    py.set(0);
  }, [px, py]);

  return {
    ref,
    reduced,
    enabled,
    style: { rotateX, rotateY, transformStyle: "preserve-3d" },
    handlers: { onPointerMove, onPointerLeave },
  };
}

/**
 * The one card surface.
 *
 * A shared constant is only right where the things wearing it really are peers
 * — the six feature tiles, the four benefit tiles. Those are lists of
 * equivalent items, and giving each its own weight would be noise, not
 * hierarchy. Everywhere the page has *one* thing to say (the hero panel, the
 * closing CTA, the last step of the workflow) the surface is written inline
 * and is deliberately different.
 *
 * The shadow is two layers on purpose: a 1px contact shadow that keeps the
 * card's edge crisp against white, and a wide soft one that carries the lift.
 * A single large blur alone reads as a smudge at these radii.
 */
export const CARD =
  "relative rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-20px_rgba(51,43,113,0.45)]";

/** Hover lift for a card that is not itself a link — transform and shadow. */
export const CARD_HOVER =
  "transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_26px_46px_-24px_rgba(51,43,113,0.55)] motion-reduce:transform-none";

/** The tinted square an icon sits in, at the top of every tile. */
export const ICON_TILE =
  "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100/60 text-brand-600 ring-1 ring-inset ring-brand-100 transition duration-300 group-hover:from-brand-500 group-hover:to-brand-600 group-hover:text-white group-hover:ring-brand-500";

/** The small caps label above every section heading. */
export const EYEBROW =
  "text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600";

/** Buttons lift on hover and press back down — the only affordance that moves. */
export const BUTTON_PRIMARY =
  "group inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(91,75,209,0.9)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_16px_32px_-12px_rgba(91,75,209,0.95)] active:translate-y-0 active:shadow-[0_6px_14px_-10px_rgba(91,75,209,0.9)] motion-reduce:transform-none";

export const BUTTON_SECONDARY =
  "group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:translate-y-0 active:shadow-sm motion-reduce:transform-none";

/** A link in the desktop nav. Underline grows from the left on hover. */
export const NAV_LINK =
  "relative rounded-md px-1 py-1.5 text-sm font-medium text-slate-600 transition-colors duration-200 hover:text-slate-900 after:absolute after:inset-x-1 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-300 hover:after:scale-x-100 motion-reduce:after:transition-none";

export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";
