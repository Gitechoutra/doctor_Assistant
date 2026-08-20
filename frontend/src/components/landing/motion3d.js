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

/* There were shared CARD / CARD_HOVER surfaces here. They are gone with the
   cards they dressed: the page now has three panels in total, each with its
   own weight, and a shared "every box looks like this" constant is exactly
   what turns a landing page into a dashboard. */

/** Buttons lift on hover and press back down — the only affordance that moves. */
export const BUTTON_PRIMARY =
  "group inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(91,75,209,0.9)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_16px_32px_-12px_rgba(91,75,209,0.95)] active:translate-y-0 active:shadow-[0_6px_14px_-10px_rgba(91,75,209,0.9)] motion-reduce:transform-none";

export const BUTTON_SECONDARY =
  "group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:translate-y-0 active:shadow-sm motion-reduce:transform-none";

export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";
