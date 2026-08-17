import { Link } from "react-router-dom";
import {
  HiOutlineArrowRight,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentChartBar,
  HiOutlineQueueList,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import Logo from "../components/Logo";

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
 * people using it are, and where to sign in.
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

function Step({ icon: Icon, who, title, body }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {who}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-800">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/50 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Logo />
        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Sign in
          <HiOutlineArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <section className="py-12 text-center sm:py-20">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            MediAssist AI
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">
            MediAssist AI runs one doctor&rsquo;s practice: the patient list, the
            appointment book, the day&rsquo;s queue, and the consultation record
            that comes out of it. Two people, one shared set of records.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-700"
            >
              Sign in to your practice
              <HiOutlineArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-slate-900">How a visit works</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
              The PA runs the desk. The doctor practises medicine. Both work from
              the same records, so neither has to ask the other what happened.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step) => (
              <Step key={step.title} {...step} />
            ))}
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800">The PA</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Registers patients, books and reschedules appointments, runs the
              day&rsquo;s queue, and reads the practice&rsquo;s records — so a
              patient ringing about a report or a past prescription gets an
              answer without interrupting a consultation.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800">The doctor</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Calls patients in, records the consultation, writes the diagnosis
              and the prescription, and issues the report. Every clinical entry
              carries their name, and only theirs.
            </p>
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-amber-100 bg-amber-50/60 p-6">
          <h3 className="text-sm font-bold text-amber-900">About the AI</h3>
          <p className="mt-2 text-sm leading-relaxed text-amber-800">
            The assistant drafts a summary from the consultation and suggests a
            prescription drawn only from the practice&rsquo;s own formulary. It
            is inert until the doctor reviews, edits and signs it, and editing a
            signed prescription clears the signature — so a sign-off always
            refers to exactly what was reviewed. It does not prescribe, and it
            does not decide anything on its own.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
          <Logo />
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <Link to="/privacy" className="transition hover:text-slate-600">
              Privacy
            </Link>
            <Link to="/terms" className="transition hover:text-slate-600">
              Terms
            </Link>
            <span>&copy; {new Date().getFullYear()} MediAssist AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
