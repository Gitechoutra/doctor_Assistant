import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  HiArrowRight,
  HiOutlineCheckBadge,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from "react-icons/hi2";
import { GlowBackdrop, SectionBadge } from "./primitives";

const TRUST_POINTS = [
  { icon: HiOutlineShieldCheck, label: "Role-based access" },
  { icon: HiOutlineCheckBadge, label: "Doctor-verified prescriptions" },
  { icon: HiOutlineSparkles, label: "Formulary-matched AI" },
];

/** The live-consultation mock. Deliberately a real composition rather than a
 *  screenshot: it stays sharp at any resolution and never goes stale when the
 *  product's UI moves on. */
function ConsultationMock() {
  const reduced = useReducedMotion();

  const bars = [3, 7, 12, 18, 24, 18, 11, 6, 14, 20, 9, 5, 12, 7, 3];

  return (
    <div className="relative w-full max-w-md">
      <GlowBackdrop className="-inset-8 bg-gradient-to-tr from-brand-300/40 via-indigo-300/30 to-transparent" />

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 28, scale: 0.97 }}
        animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="relative rounded-3xl border border-white/70 bg-white/85 p-5 shadow-2xl shadow-brand-900/15 backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {!reduced && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <p className="text-sm font-semibold text-slate-800">Live consultation</p>
          </div>
          <p className="text-[11px] font-medium text-slate-400">10:30 AM</p>
        </div>

        <div className="space-y-2.5">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
            How are you feeling today?
          </div>
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white shadow-md shadow-brand-500/25">
            Fever and headache since yesterday.
          </div>
          <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
            Any body pain or cold along with it?
          </div>
        </div>

        <div className="mt-4 flex h-12 items-center justify-center gap-1 rounded-2xl bg-slate-50 px-4">
          {bars.map((h, i) => (
            <motion.span
              key={i}
              className="w-1 rounded-full bg-gradient-to-t from-brand-400 to-brand-600"
              style={{ height: `${h}px` }}
              animate={reduced ? undefined : { scaleY: [1, 0.45, 1] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.06,
              }}
            />
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
            <HiOutlineSparkles className="h-3.5 w-3.5" />
            AI summary forming
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Viral fever suspected · Paracetamol 650mg suggested from formulary ·
            Awaiting doctor verification
          </p>
        </div>
      </motion.div>

      {/* Floating proof-points. Hidden on small screens where they would
          crowd the card rather than frame it. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, x: -20 }}
        animate={reduced ? undefined : { opacity: 1, x: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute -left-10 top-1/3 hidden rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-xl shadow-brand-900/10 backdrop-blur xl:block"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Transcription
        </p>
        <p className="mt-0.5 text-sm font-bold text-slate-900">Auto-detect · EN/HI/TE</p>
      </motion.div>

      <motion.div
        initial={reduced ? false : { opacity: 0, x: 20 }}
        animate={reduced ? undefined : { opacity: 1, x: 0 }}
        transition={{ delay: 0.75, duration: 0.5 }}
        className="absolute -right-8 bottom-16 hidden rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-xl shadow-brand-900/10 backdrop-blur xl:block"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Report
        </p>
        <p className="mt-0.5 text-sm font-bold text-slate-900">Signed PDF + QR</p>
      </motion.div>
    </div>
  );
}

export default function Hero() {
  const reduced = useReducedMotion();

  return (
    <section
      id="top"
      className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 pt-32 pb-20 lg:pt-40 lg:pb-28"
    >
      <GlowBackdrop className="-top-32 -left-32 h-[28rem] w-[28rem] bg-brand-300/35 animate-soft-float" />
      <GlowBackdrop className="top-1/4 -right-32 h-[26rem] w-[26rem] bg-indigo-300/35" />

      {/* Faint grid, masked to fade out before it reaches the copy. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(148 163 184 / 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.12) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 55% at 50% 40%, black, transparent)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 55% at 50% 40%, black, transparent)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-10">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <SectionBadge icon={HiOutlineSparkles}>AI-Powered Healthcare</SectionBadge>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Intelligent consultations,{" "}
            <span className="bg-gradient-to-r from-brand-500 via-brand-600 to-indigo-500 bg-clip-text text-transparent">
              better healthcare
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Doctors and patients simply talk. Yasodha transcribes the
            consultation live, drafts a clinical summary and a formulary-matched
            prescription, and carries the patient through nursing care to a
            signed report — one connected record, every step audited.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              to="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-500/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              Get Started
              <HiArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="rounded-full border border-slate-200 bg-white/80 px-7 py-3.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Learn More
            </a>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
            {TRUST_POINTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-sm text-slate-600">
                <Icon className="h-4.5 w-4.5 text-brand-600" />
                {label}
              </li>
            ))}
          </ul>
        </motion.div>

        <div className="flex justify-center lg:justify-end">
          <ConsultationMock />
        </div>
      </div>
    </section>
  );
}
