import { Link } from "react-router-dom";
import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  HiOutlineArrowRight,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentChartBar,
  HiOutlineIdentification,
  HiOutlinePencilSquare,
  HiOutlineQueueList,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineUserPlus,
  HiOutlineUsers,
} from "react-icons/hi2";
import Logo from "../components/Logo";
import HeroComposition from "../components/landing/HeroComposition";
import Reveal from "../components/landing/Reveal";
import WorkflowJourney from "../components/landing/WorkflowJourney";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FOCUS } from "../components/landing/motion3d";

/**
 * The public page.
 *
 * Deliberately short, and deliberately honest. What stood here was a
 * nine-section marketing site for a hospital product — invented adoption
 * statistics, invented testimonials from named staff at a named hospital, and
 * a feature tour of modules (nursing handover, pharmacy counter, laboratory)
 * this application no longer has. None of it could be made true by rewording;
 * a page that describes the software as it actually is has to be shorter.
 *
 * So this says the one thing worth saying: what the product does, who the two
 * people using it are, and where to sign in. Everything premium about the page
 * is carried by composition — depth, a drawn workflow, and motion that starts
 * and then stops — rather than by a sentence claiming something the software
 * cannot keep. See `components/landing/motion3d.js` for the motion rules; the
 * short version is transform-and-opacity only, and all of it yields to
 * `prefers-reduced-motion`.
 */

const STEPS = [
  {
    icon: HiOutlineUserPlus,
    who: "PA",
    title: "Register the patient",
    body: "Name, contact, allergies, existing conditions. Once, and the record is the practice's from then on.",
  },
  {
    icon: HiOutlineCalendarDays,
    who: "PA",
    title: "Book them in",
    body: "A slot next Thursday, or a walk-in standing at the desk right now.",
  },
  {
    icon: HiOutlineQueueList,
    who: "Both",
    title: "They join the queue",
    body: "Numbered, in arrival order. The desk and the consulting room read the same positions.",
  },
  {
    icon: HiOutlineChatBubbleLeftRight,
    who: "Doctor",
    title: "Consult",
    body: "History to hand, the conversation recorded, a summary and diagnosis drafted from it.",
  },
  {
    icon: HiOutlineClipboardDocumentList,
    who: "Doctor",
    title: "Prescribe and sign",
    body: "Suggestions drawn from the practice's own formulary. Nothing counts until the doctor signs it.",
  },
  {
    icon: HiOutlineDocumentChartBar,
    who: "Both",
    title: "It becomes history",
    body: "The visit joins the patient's record, and the PA can answer for it on the phone next week.",
  },
];

/* What the hero paragraph lists, as things rather than prose. */
const CAPABILITIES = [
  { icon: HiOutlineIdentification, label: "Patient records" },
  { icon: HiOutlineCalendarDays, label: "Appointments & queue" },
  { icon: HiOutlineClipboardDocumentList, label: "Consultation records" },
];

/* The disclaimer, kept sentence for sentence and given somewhere to sit. */
const AI_FACTS = [
  {
    icon: HiOutlineSparkles,
    title: "It drafts",
    body: "The assistant drafts a summary from the consultation and suggests a prescription drawn only from the practice's own formulary.",
  },
  {
    icon: HiOutlinePencilSquare,
    title: "It waits for a signature",
    body: "It is inert until the doctor reviews, edits and signs it, and editing a signed prescription clears the signature — so a sign-off always refers to exactly what was reviewed.",
  },
  {
    icon: HiOutlineShieldCheck,
    title: "It never decides",
    body: "It does not prescribe, and it does not decide anything on its own.",
  },
];

const ROLES = [
  {
    icon: HiOutlineUsers,
    title: "The PA",
    kicker: "At the desk",
    body: "Registers patients, books and reschedules appointments, runs the day's queue, and reads the practice's records — so a patient ringing about a report or a past prescription gets an answer without interrupting a consultation.",
    tags: ["Registration", "Appointments", "Queue"],
  },
  {
    icon: HiOutlineChatBubbleLeftRight,
    title: "The doctor",
    kicker: "In the consulting room",
    body: "Calls patients in, records the consultation, writes the diagnosis and the prescription, and issues the report. Every clinical entry carries their name, and only theirs.",
    tags: ["Consultation", "Prescription", "Report"],
  },
];

function SectionHeading({ eyebrow, title, children }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      {children && (
        <p className="mt-4 text-sm leading-relaxed text-slate-500 sm:text-base">{children}</p>
      )}
    </Reveal>
  );
}

export default function Landing() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  // Ambient depth behind the hero. The two shapes drift at different rates as
  // the page scrolls, which is the whole of the parallax — nothing that moves
  // is anything the visitor has to read.
  const driftDown = useTransform(scrollY, [0, 700], [0, reduced ? 0 : 80]);
  const driftUp = useTransform(scrollY, [0, 700], [0, reduced ? 0 : -60]);

  // The page root deliberately does not set `overflow-x-hidden`: that would
  // make it a scroll container and the sticky header would stop sticking. Each
  // section that has something bleeding past its edge clips it itself.
  return (
    // `LazyMotion` + `m` rather than `motion`: the full motion component pulls
    // its whole feature set into this route's chunk, and a landing page is the
    // one page where the first paint is the product. `domAnimation` covers
    // everything used here — hover, in-view, springs — and nothing else.
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-screen bg-white text-slate-900">
        {/* ------------------------------------------------------------------ */}
        {/* Navbar                                                             */}
        {/* ------------------------------------------------------------------ */}
        <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 supports-[backdrop-filter]:bg-white/80 supports-[backdrop-filter]:backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 sm:py-4 lg:px-8">
            <Link to="/" className={`rounded-xl ${FOCUS}`} aria-label="MediAssist AI home">
              <Logo />
            </Link>
            {/* One door, named. The sign-in accepts practice credentials only, so
                the label says so rather than leaving it to be discovered at the
                password field. */}
            {/* The arrow is dropped on the narrowest phones: logo plus a full
                button plus the arrow is about 24px more than a 320px screen
                has, and the row would push the page sideways. */}
            <Link
              to="/login"
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_20px_-12px_rgba(91,75,209,0.9)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700 active:translate-y-0 motion-reduce:transform-none sm:px-4 sm:text-sm ${FOCUS}`}
            >
              Practice Login
              <HiOutlineArrowRight className="hidden h-4 w-4 sm:block" />
            </Link>
          </div>
        </header>

        <main>
          {/* ---------------------------------------------------------------- */}
          {/* Hero                                                             */}
          {/* ---------------------------------------------------------------- */}
          <section className="relative overflow-hidden border-b border-slate-100">
            <m.div
              aria-hidden="true"
              style={{ y: driftDown }}
              className="pointer-events-none absolute -left-32 -top-24 h-80 w-80 rounded-full bg-brand-100/50 blur-3xl"
            />
            <m.div
              aria-hidden="true"
              style={{ y: driftUp }}
              className="pointer-events-none absolute -right-24 top-40 h-96 w-96 rounded-full bg-brand-50 blur-3xl"
            />

            <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:pb-24 lg:pt-20">
              <div className="text-center lg:col-span-6 lg:text-left">
                <Reveal>
                  <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700 ring-1 ring-inset ring-brand-100">
                    <HiOutlineUsers className="h-3.5 w-3.5" />
                    Built for a single-doctor practice
                  </span>
                </Reveal>

                <Reveal delay={0.06}>
                  <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
                    MediAssist AI
                  </h1>
                  <p className="mt-5 text-lg font-semibold leading-snug text-slate-700 sm:text-xl">
                    Two people, one shared set of records.
                  </p>
                  <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-500 sm:text-base lg:mx-0">
                    MediAssist AI runs one doctor&rsquo;s practice: the patient list, the appointment
                    book, the day&rsquo;s queue, and the consultation record that comes out of it.
                  </p>
                </Reveal>

                <Reveal delay={0.12}>
                  <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
                    <Link to="/login" className={`${BUTTON_PRIMARY} ${FOCUS}`}>
                      Access Your Practice
                      <HiOutlineArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:transform-none" />
                    </Link>
                    <a href="#how-it-works" className={`${BUTTON_SECONDARY} ${FOCUS}`}>
                      See how a visit works
                    </a>
                  </div>
                </Reveal>

                <Reveal delay={0.18}>
                  <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:justify-start">
                    {CAPABILITIES.map(({ icon: Icon, label }) => (
                      <li
                        key={label}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 sm:text-sm"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-brand-500" />
                        {label}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              </div>

              <div className="lg:col-span-5 lg:col-start-8">
                <Reveal delay={0.1} y={28}>
                  <HeroComposition />
                </Reveal>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Workflow                                                         */}
          {/* ---------------------------------------------------------------- */}
          <section
            id="how-it-works"
            className="border-b border-slate-100 bg-gradient-to-b from-white via-brand-50/40 to-white"
          >
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
              <SectionHeading eyebrow="The workflow" title="How a visit works">
                The PA runs the desk. The doctor practises medicine. Both work from the same records,
                so neither has to ask the other what happened.
              </SectionHeading>

              <div className="mt-12 sm:mt-16">
                <WorkflowJourney steps={STEPS} />
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* The two people                                                   */}
          {/* ---------------------------------------------------------------- */}
          <section className="border-b border-slate-100">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
              <SectionHeading eyebrow="Who uses it" title="Two people, one practice">
                The same records, read from two desks — with every clinical entry belonging to the
                one person allowed to make it.
              </SectionHeading>

              {/* Two columns of type either side of a hairline. These were
                  cards, and did not need to be: a card's border says "this is
                  a separate object", and the point of the section is that the
                  two people are not separate.

                  The hairline is drawn on each column's own right edge, so the
                  air around it comes from the columns' padding rather than
                  from a column gap — a gap would push the line hard up against
                  the text on its left. */}
              <div className="mt-12 grid grid-cols-1 gap-y-12 sm:mt-16 md:grid-cols-2 md:gap-x-0 md:divide-x md:divide-slate-100">
                {ROLES.map(({ icon: Icon, title, kicker, body, tags }, index) => (
                  <Reveal
                    key={title}
                    delay={index * 0.08}
                    className={index === 0 ? "md:pr-14" : "md:pl-14"}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-5 w-5 shrink-0 text-brand-500" />
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        {kicker}
                      </p>
                    </div>

                    <h3 className="mt-4 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                      {title}
                    </h3>

                    <p className="mt-4 max-w-prose text-sm leading-relaxed text-slate-500 sm:text-base">
                      {body}
                    </p>

                    <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {tags.join("  ·  ")}
                    </p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* AI trust                                                         */}
          {/* ---------------------------------------------------------------- */}
          <section className="border-b border-slate-100 bg-slate-50/70">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
              <SectionHeading eyebrow="Safety" title="About the AI">
                The assistant sits inside the consultation, not in front of it. Here is exactly what
                it is allowed to do.
              </SectionHeading>

              {/* This was a panel containing three more panels. Nested cards
                  are the clearest sign a layout is using borders to do a job
                  that whitespace does better — three columns of type, one
                  hairline between them, and the reading is identical. */}
              <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-y-10 sm:mt-16 md:grid-cols-3 md:gap-x-0 md:divide-x md:divide-slate-100">
                {AI_FACTS.map(({ icon: Icon, title, body }, index) => (
                  <Reveal
                    key={title}
                    delay={index * 0.06}
                    className={
                      index === 0
                        ? "md:pr-8"
                        : index === AI_FACTS.length - 1
                          ? "md:pl-8"
                          : "md:px-8"
                    }
                  >
                    <Icon className="h-6 w-6 text-brand-500" />
                    <h3 className="mt-4 text-base font-bold tracking-tight text-slate-900">
                      {title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{body}</p>
                  </Reveal>
                ))}
              </div>

              <Reveal delay={0.2}>
                <p className="mx-auto mt-12 flex max-w-5xl items-start gap-3 border-t border-slate-100 pt-8 text-base font-semibold text-slate-800 sm:items-center sm:text-lg">
                  <HiOutlineShieldCheck className="h-5 w-5 shrink-0 text-brand-500" />
                  Nothing counts until the doctor signs it.
                </p>
              </Reveal>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Closing CTA                                                      */}
          {/* ---------------------------------------------------------------- */}
          <section className="border-b border-brand-100 bg-brand-50/50">
            <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
              <Reveal>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Get back to your practice
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base">
                  The patient list, the appointment book and the day&rsquo;s queue are all behind the
                  same door.
                </p>
                <Link to="/login" className={`mt-8 ${BUTTON_PRIMARY} ${FOCUS}`}>
                  Access Your Practice
                  <HiOutlineArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:transform-none" />
                </Link>
              </Reveal>
            </div>
          </section>
        </main>

        <footer className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
              <div>
                <Logo />
                <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
                  One practice, one shared set of records.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
                <Link to="/privacy" className={`rounded transition hover:text-slate-600 ${FOCUS}`}>
                  Privacy
                </Link>
                <Link to="/terms" className={`rounded transition hover:text-slate-600 ${FOCUS}`}>
                  Terms
                </Link>
                <span>&copy; {new Date().getFullYear()} MediAssist AI</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </LazyMotion>
  );
}
