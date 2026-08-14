import { useEffect, useState } from "react";

/**
 * The value, but only after it has stopped changing for `delay` ms.
 *
 * What this is for: search boxes fire on every keystroke, and a request per
 * keystroke means "Rahul" costs five round trips, four of which are already
 * stale when they land — and the results visibly flicker backwards as the
 * slower ones arrive. Debouncing collapses a burst of typing into the one
 * query the person actually meant.
 *
 * 350ms by default: below about 250 the saving mostly disappears, and above
 * about 500 the pause before results appear starts reading as lag rather than
 * as the app thinking.
 */
export default function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // Cleared and re-armed on every change, so the timer only ever fires once
    // the typing has actually stopped.
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
