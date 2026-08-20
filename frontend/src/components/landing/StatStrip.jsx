import Reveal from "./Reveal";

/**
 * The trust band.
 *
 * A landing page usually puts adoption numbers here - patients treated,
 * practices onboarded, uptime. This product has none of those to report, and
 * the last version of this page was rewritten precisely because it claimed
 * some it had invented. So the figures below are about the software's own
 * design, every one of them checkable in the repository: the two roles in
 * `helpers/decorators.py`, the six stages in the workflow above, the single
 * formulary the suggester is bounded by, and the zero prescriptions that leave
 * the system without a signature.
 *
 * Stated as design guarantees, they are worth more than a usage count anyway -
 * a practice choosing clinical software is buying the second thing, not the
 * first.
 */
export default function StatStrip({ stats }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 px-6 py-10 shadow-[0_30px_60px_-30px_rgba(51,43,113,0.75)] sm:px-10 sm:py-12">
      {/* Two decorative washes. The teal is the only place a second hue
          appears at this size, and it is behind a heavy blur - enough to warm
          the corner, never enough to read as a second brand colour. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-care-400/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-brand-400/30 blur-3xl"
      />

      <div className="relative">
        <Reveal className="flex items-center justify-center gap-2.5">
          <span className="relative grid h-2 w-2 place-items-center">
            <span
              aria-hidden="true"
              className="animate-pulse-ring absolute inset-0 rounded-full bg-care-300"
            />
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-care-300" />
          </span>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-100">
            Guaranteed by design, not by policy
          </p>
        </Reveal>

        <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-9 sm:gap-x-8 lg:grid-cols-4">
          {stats.map(({ value, label, detail }, index) => (
            <Reveal key={label} delay={index * 0.07} className="text-center">
              <dt className="sr-only">{label}</dt>
              <dd>
                <p className="text-4xl font-bold tracking-tight tabular-nums text-white sm:text-5xl">
                  {value}
                </p>
                <p className="mt-2.5 text-sm font-semibold text-white sm:text-base">{label}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-brand-100/90">{detail}</p>
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </div>
  );
}
