import { HiOutlineChatBubbleBottomCenterText, HiStar } from "react-icons/hi2";
import { TESTIMONIALS } from "./content";
import { Reveal, SectionHeading } from "./primitives";

export default function Testimonials() {
  return (
    <section className="relative bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          badge="From the floor"
          badgeIcon={HiOutlineChatBubbleBottomCenterText}
          title="What clinicians say about"
          highlight="working this way"
          description="The change people notice first is not the AI — it is not having to write everything down twice."
        />

        <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {TESTIMONIALS.map(({ quote, role, unit, initials }, i) => (
            <Reveal key={role} delay={i * 0.1}>
              <figure className="group relative flex h-full flex-col rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/10">
                <span
                  aria-hidden="true"
                  className="absolute right-6 top-5 select-none font-serif text-6xl leading-none text-brand-100 transition group-hover:text-brand-200"
                >
                  &rdquo;
                </span>

                <div className="relative flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <HiStar key={s} className="h-4 w-4 text-amber-400" />
                  ))}
                </div>

                <blockquote className="relative mt-4 flex-1 text-sm leading-relaxed text-slate-600">
                  {quote}
                </blockquote>

                <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-md shadow-brand-500/25">
                    {initials}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{role}</p>
                    <p className="text-xs text-slate-500">{unit}</p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
