import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HiOutlinePlus, HiOutlineQuestionMarkCircle } from "react-icons/hi2";
import { FAQS } from "./content";
import { Reveal, SectionHeading } from "./primitives";

function FaqItem({ question, answer, isOpen, onToggle }) {
  const reduced = useReducedMotion();
  const id = useId();

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white transition duration-300 ${
        isOpen ? "border-brand-200 shadow-lg shadow-brand-900/5" : "border-slate-100 shadow-sm"
      }`}
    >
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`${id}-panel`}
          id={`${id}-button`}
          className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span
            className={`text-sm font-bold sm:text-base ${
              isOpen ? "text-brand-700" : "text-slate-900"
            }`}
          >
            {question}
          </span>
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition duration-300 ${
              isOpen ? "rotate-45 bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            <HiOutlinePlus className="h-4 w-4" />
          </span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={`${id}-panel`}
            role="region"
            aria-labelledby={`${id}-button`}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={reduced ? undefined : { height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 text-sm leading-relaxed text-slate-600">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Faq() {
  // Single-open accordion: with six long answers, letting them all sit open
  // buries the questions underneath.
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="relative bg-gradient-to-b from-white to-slate-50 py-24 sm:py-28">
      <div className="mx-auto max-w-4xl px-6 lg:px-10">
        <SectionHeading
          badge="FAQ"
          badgeIcon={HiOutlineQuestionMarkCircle}
          title="Questions worth"
          highlight="asking first"
          description="The things hospitals ask before they let software near a prescription."
        />

        <div className="mt-14 space-y-4">
          {FAQS.map(({ q, a }, i) => (
            <Reveal key={q} delay={i * 0.05}>
              <FaqItem
                question={q}
                answer={a}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
