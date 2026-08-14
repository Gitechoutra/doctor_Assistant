/**
 * Calendar dates as the hospital reads them.
 *
 * Everything here is wall-clock local on purpose. The shift schedule and the doctor
 * availability screens both store and compare plain `YYYY-MM-DD` days, and a
 * day is whatever day it is in the building — not in UTC.
 */

/** Today (or today ± offsetDays) as YYYY-MM-DD in the *hospital's* timezone.
 *
 *  Built from the local date parts rather than `toISOString()`, which converts
 *  to UTC first and so returns the wrong day for part of every day: east of
 *  UTC it reads a day behind until the offset passes (05:30 in IST), west of
 *  it a day ahead all evening. A shift schedule is wall-clock local — matching the
 *  storage model — so an administrator scheduling the night shift at 2am must
 *  not be handed yesterday's date as the default. */
export function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Mon 11 Aug 2026" — a schedule is read by date, so the weekday leads.
 *
 *  The `T00:00:00` matters: `new Date("2026-08-11")` is parsed as UTC midnight
 *  and renders as the previous day west of Greenwich. */
export function formatDay(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
