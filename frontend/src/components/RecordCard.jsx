import Avatar from "./Avatar";

/**
 * The card shell shared by the four record lists — Appointments,
 * Consultations, Cases and Prescriptions.
 *
 * These pages sit next to each other in the sidebar and show the same kind of
 * thing (a patient, some status pills, a couple of actions), but each had
 * grown its own padding, avatar size, badge colours and footer. Pulling the
 * shell out here is what actually keeps them consistent: a spacing change is
 * one edit, not four that drift apart on the next one.
 *
 * The pieces are deliberately small and unopinionated about content — the
 * pages still decide what goes in the badge row and the footer.
 */

/** Icon + title, at the top of a list page. */
export function PageHeader({ icon: Icon, title, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-6 w-6 shrink-0 text-brand-600" />}
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const BADGE_TONES = {
  emerald: "bg-emerald-50 text-emerald-700",
  emeraldSolid: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  brand: "bg-brand-50 text-brand-700",
  slate: "bg-slate-100 text-slate-600",
  slateSolid: "bg-slate-200 text-slate-700",
  // Critical-severity emergencies only — nothing else in the app is this
  // urgent, which is the point of reserving a colour for it.
  red: "bg-red-100 text-red-700",
};

/** One status pill. Same size and weight everywhere, so a row of them lines up. */
export function Badge({ tone = "slate", icon: Icon, title, children }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        BADGE_TONES[tone] || BADGE_TONES.slate
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </span>
  );
}

/**
 * Three across on a large desktop, two on a tablet, one on a phone.
 * `items-stretch` (the grid default) is what gives a row equal-height cards
 * without measuring anything.
 *
 * `align="start"` opts out of that, and lists whose cards expand in place need
 * it: under stretch, opening one card's detail panel grows the whole grid row,
 * so its neighbours are stretched to match and look like they opened too.
 */
export function RecordGrid({ align, children }) {
  return (
    <div
      className={`grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 ${
        align === "start" ? "items-start" : ""
      }`}
    >
      {children}
    </div>
  );
}

/** Placeholder tiles in the same grid, so loading doesn't reflow the page. */
export function RecordGridSkeleton({ count = 6 }) {
  return (
    <RecordGrid>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </RecordGrid>
  );
}

/**
 * A column layout is what makes cards in the same row match: the grid stretches
 * every cell by default, and `RecordCardFooter`'s `mt-auto` pushes the actions
 * to the bottom rather than relying on the content being equally long. No
 * `h-full` here — on an `items-start` grid a percentage height still resolves
 * against the grid area, so the card would be stretched back to the row height.
 *
 * `accent` tints the border for a card that needs to stand out (the patient in
 * the room now, the one to call in next) without changing its size.
 */
export function RecordCard({ accent, children }) {
  const border =
    accent === "emerald"
      ? "border-emerald-200 ring-1 ring-emerald-100"
      : accent === "brand"
        ? "border-brand-200 ring-1 ring-brand-100"
        : "border-slate-100";

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${border}`}
    >
      {children}
    </div>
  );
}

/** The card's scrolling-free content area. Grows to fill the stretched cell. */
export function RecordCardBody({ children }) {
  return <div className="flex flex-1 flex-col p-5">{children}</div>;
}

/**
 * Avatar, name and up to two lines of grey meta.
 *
 * `min-w-0` on the text column plus `truncate` on each line is what stops a
 * long patient name from widening the grid cell and pushing the card out of
 * its column — the usual cause of horizontal scroll on a phone.
 */
export function RecordCardHeader({ name, imageUrl, badge, lines = [] }) {
  return (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0">
        <Avatar name={name} imageUrl={imageUrl} size="lg" />
        {badge}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900" title={name}>
          {name || "—"}
        </p>
        {lines.filter(Boolean).map((line, i) => (
          <p key={i} className="mt-0.5 truncate text-xs text-slate-400" title={line}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

/** The status-pill row. Wraps rather than overflowing on a narrow card. */
export function RecordCardBadges({ children }) {
  return <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>;
}

/** A label-over-value fact. Used in the small grids inside a card. */
export function RecordDetail({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium capitalize text-slate-700">
        {value ?? "—"}
      </p>
    </div>
  );
}

/** The expandable panel below the summary, inside the card body. */
export function RecordCardPanel({ children }) {
  return <div className="mt-4 rounded-xl bg-slate-50/70 p-3">{children}</div>;
}

/** Actions, pinned to the bottom edge of every card in the row. */
export function RecordCardFooter({ children }) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
      {children}
    </div>
  );
}

/** The muted secondary action in a footer (Open consultation, Open case…). */
export const cardLinkClass =
  "rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50";

/** The one primary action a card is allowed. */
export const cardPrimaryClass =
  "flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-60";

/** The toggle that opens the card's detail panel. */
export const cardToggleClass =
  "flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700";

/** Nothing to show — same box on every list page. */
export function EmptyState({ icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
      {Icon && <Icon className="mx-auto h-8 w-8 text-slate-300" />}
      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">{children}</p>
    </div>
  );
}
