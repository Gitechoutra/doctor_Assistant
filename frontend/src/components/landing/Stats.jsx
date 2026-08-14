import { STATS } from "./content";
import { CountUp, Reveal } from "./primitives";

export default function Stats() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 py-20 sm:py-24">
      {/* Two soft lights so the band reads as depth rather than a flat fill. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Trusted across the hospital
          </h2>
          <p className="mt-3 text-base text-brand-100">
            Consultations, prescriptions and reports handled end to end on the platform.
          </p>
        </Reveal>

        <dl className="mt-14 grid grid-cols-2 gap-6 sm:gap-8 lg:grid-cols-5">
          {STATS.map(({ label, value, suffix, icon: Icon }, i) => (
            <Reveal key={label} delay={i * 0.08}>
              <div className="group h-full rounded-2xl border border-white/15 bg-white/10 p-6 text-center backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-white/15">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white/15 text-white transition duration-300 group-hover:scale-110">
                  <Icon className="h-5.5 w-5.5" />
                </div>
                <dd className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  <CountUp value={value} suffix={suffix} />
                </dd>
                <dt className="mt-1.5 text-xs font-medium text-brand-100 sm:text-sm">
                  {label}
                </dt>
              </div>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
