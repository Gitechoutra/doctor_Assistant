import { HiOutlineArrowPath } from "react-icons/hi2";
import { WORKFLOW } from "./content";
import { GlowBackdrop, Reveal, SectionHeading } from "./primitives";

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white py-24 sm:py-28"
    >
      <GlowBackdrop className="-left-40 top-1/4 h-96 w-96 bg-brand-200/40" />
      <GlowBackdrop className="-right-40 bottom-1/4 h-96 w-96 bg-indigo-200/40" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          badge="How it works"
          badgeIcon={HiOutlineArrowPath}
          title="From the waiting room to a"
          highlight="signed report"
          description="Six steps, each one owned by the person accountable for it. Nothing advances on the AI's say-so alone."
        />

        <div className="relative mt-16">
          {/* The spine the steps hang off. Hidden below lg, where the cards
              stack and a vertical rule would just be noise. */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brand-200 to-transparent lg:block"
          />

          <ol className="space-y-6 lg:space-y-0">
            {WORKFLOW.map(({ step, icon: Icon, title, body }, i) => {
              const alignRight = i % 2 === 1;
              return (
                <li key={step} className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
                  {/* Spacer keeps the card on its own side of the spine. */}
                  {alignRight && <div className="hidden lg:block" aria-hidden="true" />}

                  <Reveal delay={0.05} className={alignRight ? "lg:pl-4" : "lg:pr-4"}>
                    <div
                      className={`relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/10 lg:my-4 ${
                        alignRight ? "" : "lg:text-right"
                      }`}
                    >
                      <div
                        className={`flex items-center gap-4 ${
                          alignRight ? "" : "lg:flex-row-reverse"
                        }`}
                      >
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs font-bold tracking-widest text-brand-500">
                            STEP {step}
                          </p>
                          <h3 className="mt-0.5 text-base font-bold text-slate-900">
                            {title}
                          </h3>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-relaxed text-slate-500">{body}</p>

                      {/* The node on the spine. */}
                      <span
                        aria-hidden="true"
                        className={`absolute top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500 shadow-md lg:block ${
                          alignRight ? "-left-[3.35rem]" : "-right-[3.35rem]"
                        }`}
                      />
                    </div>
                  </Reveal>

                  {!alignRight && <div className="hidden lg:block" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
