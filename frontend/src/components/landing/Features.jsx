import { HiOutlineSquares2X2 } from "react-icons/hi2";
import { FEATURES } from "./content";
import { Reveal, SectionHeading } from "./primitives";

export default function Features() {
  return (
    <section id="features" className="relative bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          badge="Platform"
          badgeIcon={HiOutlineSquares2X2}
          title="Everything a consultation"
          highlight="actually needs"
          description="Ten capabilities that cover the visit end to end — from the first word spoken to the signed report the patient takes home."
        />

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <article className="group relative h-full overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/10">
                {/* Wash that only appears on hover — keeps the resting grid calm. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50/0 via-brand-50/0 to-brand-100/0 transition duration-300 group-hover:to-brand-100/60"
                />
                <div className="relative">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25 transition duration-300 group-hover:scale-110">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-base font-bold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
