import { m, useReducedMotion } from "framer-motion";

/**
 * Reveals its children once, when they first scroll into view.
 *
 * `once` matters: a section that re-animates every time it re-enters the
 * viewport turns a scroll back up the page into a light show. It fires at 20%
 * visibility so a tall card is not still blank when its top edge is already
 * well up the screen.
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
  y = 20,
  as = "div",
}) {
  const reduced = useReducedMotion();
  const Tag = m[as] ?? m.div;

  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}
