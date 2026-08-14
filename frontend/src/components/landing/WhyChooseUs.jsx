import { HiOutlineShieldCheck } from "react-icons/hi2";
import { REASONS } from "./content";
import { Reveal, SectionHeading } from "./primitives";

export default function WhyChooseUs() {
  return (
    <section id="why-us" className="relative bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          badge="Why choose us"
          badgeIcon={HiOutlineShieldCheck}
          title="Built for the ward, not the"
          highlight="demo"
          description="The decisions that matter in a hospital are the boring ones: who can see what, what happens when the AI is wrong, and whether you can prove what was done."
        />

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {REASONS.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <article className="group relative h-full rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/10">
                <div className="inline-grid h-12 w-12 place-items-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-600 transition duration-300 group-hover:bg-brand-600 group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
