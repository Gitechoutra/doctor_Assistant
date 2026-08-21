import { Link } from "react-router-dom";
import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  HiOutlineArrowRight,
  HiOutlineBolt,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentChartBar,
  HiOutlineIdentification,
  HiOutlineLockClosed,
  HiOutlinePencilSquare,
  HiOutlineQueueList,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
  HiOutlineUserPlus,
  HiOutlineUsers,
} from "react-icons/hi2";
import AiSafetyNote from "../components/AiSafetyNote";
import Logo from "../components/Logo";
import FeatureGrid from "../components/landing/FeatureGrid";
import HeroComposition from "../components/landing/HeroComposition";
import LandingNav from "../components/landing/LandingNav";
import PulseTrace from "../components/landing/PulseTrace";
import Reveal from "../components/landing/Reveal";
import StatStrip from "../components/landing/StatStrip";
import WorkflowJourney from "../components/landing/WorkflowJourney";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  EYEBROW,
  FOCUS,
} from "../components/landing/motion3d";

/**
 * The public page.
 *
 * One rule governs every word below, and it is worth stating because the page
 * that stood here before the last rewrite broke it: nothing on this page
 * claims anything the software cannot keep. There are no invented adoption
 * figures, no testimonials from staff who do not exist, and no feature tour of
 * modules (pharmacy counter, laboratory, nursing handover) this application
 * has never had. Every capability named here maps to a route in
 * `backend/portal/routes`, and the numbers in the trust band describe the
 * product's own design rather than its usage - see StatStrip for why that is
 * the stronger claim anyway.
 *
 * What the page does spend on is composition: depth behind the hero, a drawn
 * workflow rather than six boxes, a dark band to break the white, and motion
 * that starts and then stops. See `components/landing/motion3d.js` for the
 * motion rules - transform and opacity only, and all of it yields to
 * `prefers-reduced-motion`.
 *
 * One door, because there is one kind of account. The practice signs in at
 * /login and the server issues exactly two roles, doctor and PA. A patient
 * portal was drawn here once; it has been removed rather than left as a link
 * to a sign-in this application does not have.
 */

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

/** The six areas of the product. Peers, hence a grid; see FeatureGrid. */
const FEATURES = [
  {
    icon: HiOutlineCalendarDays,
    title: "Appointments & queue",
    body: "Book a slot for next Thursday or take the walk-in standing at the desk, then run the day from a single numbered queue.",
    points: [
      "Check in, reschedule, cancel, print a slip",
      "Positions numbered on the server, never guessed",
      "The desk and the consulting room read the same order",
    ],
  },
  {
    icon: HiOutlineIdentification,
    title: "Patient management",
    body: "One record per patient, registered once at the desk and owned by the practice from that point on.",
    points: [
      "Contact details, allergies, existing conditions",
      "Every past visit, prescription and report in one place",
      "Searchable from anywhere in the application",
    ],
  },
  {
    icon: HiOutlineChatBubbleLeftRight,
    title: "Doctor consultation",
    body: "The doctor calls the patient in from that same queue and works with the whole history already to hand.",
    points: [
      "Voice-assisted: the conversation is transcribed",
      "Clinical summary and assistive diagnosis drafted from it",
      "Both screens stay in step over a live connection",
    ],
  },
  {
    icon: HiOutlineSparkles,
    title: "AI assistance",
    body: "Gemini drafts the summary, an assistive diagnosis and a prescription suggestion - and then waits.",
    points: [
      "Suggests only from the practice's own formulary",
      "Drafts language, never clinical decisions",
      "Inert until the doctor reviews and signs",
    ],
    highlight: true,
  },
  {
    icon: HiOutlineClipboardDocumentList,
    title: "Prescriptions",
    body: "Written from the practice's catalogue, signed by the doctor, and honest about what a signature covers.",
    points: [
      "Full formulary with brands, and a route to request a missing one",
      "Editing a signed prescription clears the signature",
      "So a sign-off always refers to exactly what was reviewed",
    ],
  },
  {
    icon: HiOutlineDocumentChartBar,
    title: "Records & reports",
    body: "The visit becomes history - a report the practice issues, and a record the desk can answer for next week.",
    points: [
      "Reports and case summaries generated as PDFs",
      "Readable by both roles, writable by one",
      "Clinical actions written to an audit log",
    ],
  },
];

/** The visit, in the order it happens. Drawn as one line, not six boxes. */
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

/**
 * The trust band. Design guarantees, not usage figures - every one of these
 * four is checkable in the repository. See StatStrip for the reasoning.
 */
const STATS = [
  {
    value: "2",
    label: "Roles, kept apart",
    detail: "Separation of duties enforced by the API, not merely hidden in the interface.",
  },
  {
    value: "6",
    label: "Stages, one thread",
    detail: "Front desk to signed record, with nothing re-keyed in between.",
  },
  {
    value: "1",
    label: "Formulary",
    detail: "The only catalogue the assistant is allowed to suggest a medicine from.",
  },
  {
    value: "0",
    label: "Unsigned prescriptions",
    detail: "Nothing issues, and nothing counts, until the doctor has signed it.",
  },
];

/** Why a practice would choose this over the generic alternative. */
const REASONS = [
  {
    icon: HiOutlineLockClosed,
    title: "A boundary you can audit",
    body: "The PA reads the entire clinical record and writes to none of it. That rule is declared in one file on the server and re-checked on every request, so it holds regardless of what a browser is showing.",
  },
  {
    icon: HiOutlineBolt,
    title: "One queue, no interruptions",
    body: "The doctor presses Start and the number on the desk's screen moves. Nobody presses refresh, and nobody walks into a consultation to ask who is next.",
  },
  {
    icon: HiOutlineSparkles,
    title: "AI that drafts and then stops",
    body: "The assistant writes the parts that are typing - the summary, a suggested prescription from the practice's own list. It does not prescribe, and it decides nothing on its own.",
  },
  {
    icon: HiOutlineSquares2X2,
    title: "Sized for a practice, not a hospital",
    body: "No departments, no stock control, no modules nobody opens. Registration, the book, the queue, the consultation and the record - the five things a single-doctor practice actually runs on.",
  },
];

/** The four reasons above, compressed to three chips. */
const ASSURANCES = [
  { icon: HiOutlineLockClosed, label: "Role-separated" },
  { icon: HiOutlineDocumentChartBar, label: "Audit-logged" },
  { icon: HiOutlineShieldCheck, label: "Doctor-signed" },
];

/** The disclaimer, kept sentence for sentence and given somewhere to sit. */
const AI_FACTS = [
  {
    icon: HiOutlineSparkles,
    title: "It drafts",
    body: "The assistant drafts a summary from the consultation and suggests a prescription drawn only from the practice's own formulary.",
  },
  {
    icon: HiOutlinePencilSquare,
    title: "It waits for a signature",
    body: "It is inert until the doctor reviews, edits and signs it, and editing a signed prescription clears the signature - so a sign-off always refers to exactly what was reviewed.",
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
    body: "Registers patients, books and reschedules appointments, runs the day's queue, and reads the practice's records - so a patient ringing about a report or a past prescription gets an answer without interrupting a consultation.",
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

/* What the hero paragraph lists, as things rather than prose. */
const CAPABILITIES = [
  { icon: HiOutlineIdentification, label: "Patient records" },
  { icon: HiOutlineCalendarDays, label: "Appointments & queue" },
  { icon: HiOutlineClipboardDocumentList, label: "Consultation records" },
  { icon: HiOutlineShieldCheck, label: "Doctor-signed" },
];

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A footer link.
 *
 * `inline-block py-1` is not decoration: these sit in lists and in a row
 * rather than inline in a sentence, so WCAG 2.5.8's exception for text links
 * inside prose does not apply to them. At their natural 16-19px they were
 * under the 24px minimum target; the padding clears it without changing the
 * layout, because the lists' own spacing already sets the rhythm.
 */
const FOOTER_LINK =
  "inline-block rounded py-1 transition hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";

/** Eyebrow, heading and an optional standfirst, centred. Used by every
 *  section, so the vertical rhythm between a heading and its section is set
 *  once rather than six times. */
function SectionHeading({ eyebrow, title, children }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className={EYEBROW}>{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-[2.1rem] lg:leading-tight">
        {title}
      </h2>
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
  // the page scrolls, which is the whole of the parallax - nothing that moves
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
    // everything used here - hover, in-view, springs - and nothing else.
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-screen bg-white text-slate-900">
        <LandingNav />

        <main>
          {/* ---------------------------------------------------------------- */}
          {/* Hero                                                             */}
          {/* ---------------------------------------------------------------- */}
          <section className="relative overflow-hidden border-b border-slate-100">
            {/* The grid is masked out well before it reaches the headline -
                a ruled background behind body copy costs legibility for an
                effect nobody consciously sees. */}
            <div
              aria-hidden="true"
              className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]"
            />
            <m.div
              aria-hidden="true"
              style={{ y: driftDown }}
              className="pointer-events-none absolute -left-32 -top-24 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl"
            />
            <m.div
              aria-hidden="true"
              style={{ y: driftUp }}
              className="pointer-events-none absolute -right-24 top-40 h-96 w-96 rounded-full bg-care-100/50 blur-3xl"
            />

            <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:pb-24 lg:pt-20">
              <div className="text-center lg:col-span-7 lg:text-left">
                <Reveal>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700 shadow-sm ring-1 ring-inset ring-brand-100">
                    <HiOutlineUsers className="h-3.5 w-3.5" />
                    Built for a single-doctor practice
                  </span>
                </Reveal>

                <Reveal delay={0.06}>
                  {/* Sized to break where the copy means to break: "Run the
                      whole practice" on one line, the gradient clause on the
                      next. At the previous 3.35rem in a six-column well it
                      took four ragged lines, which is a headline no longer
                      doing a headline's job. */}
                  <h1 className="mt-6 text-[2.1rem] font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-[2.75rem] lg:text-[3.1rem] lg:leading-[1.07]">
                    Run the whole practice
                    <span className="block bg-gradient-to-r from-brand-600 via-brand-500 to-care-500 bg-clip-text text-transparent">
                      from one shared record.
                    </span>
                  </h1>
                  <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
                    <span className="font-semibold text-slate-800">MediAssist AI</span> gives the
                    front desk and the consulting room the same patient list, the same appointment
                    book and the same queue - with an assistant that drafts the consultation and a
                    doctor who signs it.
                  </p>
                </Reveal>

                <Reveal delay={0.12}>
                  <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
                    <Link to="/login" className={`${BUTTON_PRIMARY} ${FOCUS}`}>
                      Sign in
                      <HiOutlineArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:transform-none" />
                    </Link>
                    <a href="#how-it-works" className={`${BUTTON_SECONDARY} ${FOCUS}`}>
                      See how a visit works
                    </a>
                  </div>

                </Reveal>

                <Reveal delay={0.18}>
                  <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-t border-slate-100 pt-7 lg:justify-start">
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
          {/* Trust band                                                       */}
          {/* ---------------------------------------------------------------- */}
          <section className="border-b border-slate-100 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
              <StatStrip stats={STATS} />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Features                                                         */}
          {/* ---------------------------------------------------------------- */}
          <section id="features" className="border-b border-slate-100 bg-slate-50/60">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
              <SectionHeading eyebrow="What it does" title="Everything a practice runs on">
                Six areas, one record underneath all of them. Nothing here is a module to be bought
                separately, and nothing here is a screenshot of software that does not exist yet.
              </SectionHeading>

              <div className="mt-12 sm:mt-16">
                <FeatureGrid features={FEATURES} />
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* How it works                                                     */}
          {/* ---------------------------------------------------------------- */}
          <section
            id="how-it-works"
            className="border-b border-slate-100 bg-gradient-to-b from-white via-brand-50/40 to-white"
          >
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
              <SectionHeading eyebrow="How it works" title="One visit, start to finish">
                The PA runs the desk. The doctor practises medicine. Both work from the same
                records, so neither has to ask the other what happened.
              </SectionHeading>

              <div className="mt-12 sm:mt-16">
                <WorkflowJourney steps={STEPS} />
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Why choose MediAssist AI                                         */}
          {/* ---------------------------------------------------------------- */}
          <section id="why-us" className="border-b border-slate-100 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
              {/* Asymmetric on purpose. The features above are a grid because
                  they are a list; this is an argument, so it reads as a claim
                  on the left and its four supports on the right. On a sticky
                  left column the claim stays in view while the supports
                  scroll past it. */}
              <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
                <div className="lg:col-span-5">
                  <div className="lg:sticky lg:top-28">
                    <Reveal>
                      <p className={EYEBROW}>Why MediAssist AI</p>
                      <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-[2.1rem] lg:leading-tight">
                        Trust is the feature
                      </h2>
                      <p className="mt-4 text-sm leading-relaxed text-slate-500 sm:text-base">
                        Clinical software earns its place by being predictable. The four things
                        below are the ones a practice would otherwise have to take on faith - and
                        each is a rule in the system rather than a promise in a brochure.
                      </p>
                      <PulseTrace className="mt-8 text-brand-300" />

                      {/* Three assurances rather than empty column. The
                          section is barely taller than the viewport, so the
                          sticky column never travels far enough for its
                          whitespace to read as deliberate - it just reads as
                          a gap. Each of these three is the one-word form of a
                          claim made in full on the right. */}
                      <ul className="mt-8 flex flex-wrap gap-2.5">
                        {ASSURANCES.map(({ icon: Icon, label }) => (
                          <li
                            key={label}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm"
                          >
                            <Icon className="h-4 w-4 shrink-0 text-brand-500" />
                            {label}
                          </li>
                        ))}
                      </ul>
                    </Reveal>
                  </div>
                </div>

                <div className="lg:col-span-7">
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {REASONS.map(({ icon: Icon, title, body }, index) => (
                      <Reveal key={title} delay={index * 0.06} as="li" className="group py-7 sm:py-8">
                        <div className="flex gap-4 sm:gap-5">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 transition duration-300 group-hover:bg-brand-600 group-hover:text-white group-hover:ring-brand-600">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div>
                            <h3 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                              {title}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                              {body}
                            </p>
                          </div>
                        </div>
                      </Reveal>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* The two people                                                   */}
          {/* ---------------------------------------------------------------- */}
          <section className="border-b border-slate-100 bg-slate-50/60">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
              <SectionHeading eyebrow="Who uses it" title="Two people, one practice">
                The same records, read from two desks - with every clinical entry belonging to the
                one person allowed to make it.
              </SectionHeading>

              {/* Two columns of type either side of a hairline. These were
                  cards, and did not need to be: a card's border says "this is
                  a separate object", and the point of the section is that the
                  two people are not separate.

                  The hairline is drawn on each column's own right edge, so the
                  air around it comes from the columns' padding rather than
                  from a column gap - a gap would push the line hard up against
                  the text on its left. */}
              <div className="mt-12 grid grid-cols-1 gap-y-12 sm:mt-16 md:grid-cols-2 md:gap-x-0 md:divide-x md:divide-slate-200">
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

                    <ul className="mt-6 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 ring-1 ring-inset ring-slate-200"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* AI trust                                                         */}
          {/* ---------------------------------------------------------------- */}
          <section className="border-b border-slate-100 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
              <SectionHeading eyebrow="Safety" title="About the AI">
                The assistant sits inside the consultation, not in front of it. Here is exactly what
                it is allowed to do.
              </SectionHeading>

              {/* This was a panel containing three more panels. Nested cards
                  are the clearest sign a layout is using borders to do a job
                  that whitespace does better - three columns of type, one
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

              <Reveal delay={0.26}>
                <AiSafetyNote className="mx-auto mt-8 max-w-5xl" />
              </Reveal>
            </div>
          </section>


          {/* ---------------------------------------------------------------- */}
          {/* Closing CTA                                                      */}
          {/* ---------------------------------------------------------------- */}
          <section className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900">
            <div
              aria-hidden="true"
              className="bg-grid pointer-events-none absolute inset-0 opacity-[0.14] [mask-image:radial-gradient(80%_60%_at_50%_50%,black,transparent)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-24 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-care-400/20 blur-3xl"
            />

            <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8">
              <Reveal>
                <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Get back to your practice
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-brand-100 sm:text-base">
                  The patient list, the appointment book and the day&rsquo;s queue are all behind
                  the same door.
                </p>

                {/* One button now, so it sits at its own width rather than
                    stretching: the row it shared with the portal link is gone.
                    Inverted rather than reusing BUTTON_PRIMARY - a brand button
                    on a brand field has no edge to read. */}
                <div className="mt-10 flex justify-center">
                  <Link
                    to="/login"
                    className={`group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-brand-800 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-50 active:translate-y-0 motion-reduce:transform-none ${FOCUS} focus-visible:ring-white focus-visible:ring-offset-brand-800`}
                  >
                    Access your practice
                    <HiOutlineArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:transform-none" />
                  </Link>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        {/* ------------------------------------------------------------------ */}
        {/* Footer                                                             */}
        {/* ------------------------------------------------------------------ */}
        <footer className="border-t border-slate-100 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-10 sm:gap-8 lg:grid-cols-12">
              <div className="col-span-2 lg:col-span-5">
                <Logo />
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
                  One practice, one shared set of records - from the front desk to the signed
                  report.
                </p>
              </div>

              <nav aria-label="Product" className="lg:col-span-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Product
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
                  <li>
                    <a href="#features" className={FOOTER_LINK}>
                      Features
                    </a>
                  </li>
                  <li>
                    <a href="#how-it-works" className={FOOTER_LINK}>
                      How it works
                    </a>
                  </li>
                  <li>
                    <a href="#why-us" className={FOOTER_LINK}>
                      Why MediAssist AI
                    </a>
                  </li>
                </ul>
              </nav>

              <nav aria-label="Sign in" className="lg:col-span-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Sign in
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
                  <li>
                    <Link to="/login" className={FOOTER_LINK}>
                      Practice login
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="mt-12 flex flex-col items-center gap-4 border-t border-slate-100 pt-8 text-xs text-slate-400 sm:flex-row sm:justify-between">
              <p>&copy; {new Date().getFullYear()} MediAssist AI</p>
              <div className="flex items-center gap-6">
                <Link to="/privacy" className={FOOTER_LINK}>
                  Privacy
                </Link>
                <Link to="/terms" className={FOOTER_LINK}>
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </LazyMotion>
  );
}
