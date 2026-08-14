import { Link } from "react-router-dom";
import { HiArrowRight, HiOutlineCheckCircle } from "react-icons/hi2";
import { Reveal } from "./primitives";

const POINTS = [
  "Live voice transcription",
  "Doctor-verified prescriptions",
  "Full nursing handover",
  "Audited end to end",
];

export default function CallToAction() {
  return (
    <section className="relative bg-slate-50 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 px-8 py-16 shadow-2xl shadow-brand-900/25 sm:px-14 sm:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-indigo-400/25 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.15]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, black, transparent)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 60% 60% at 50% 50%, black, transparent)",
              }}
            />

            <div className="relative mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Ready to give your clinicians their attention back?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-brand-100">
                Sign in to see the whole flow — register a patient, run a voice
                consultation, verify the prescription and hand over to nursing.
              </p>

              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Link
                  to="/login"
                  className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-brand-700 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
                >
                  Get Started
                  <HiArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#features"
                  className="rounded-full border border-white/40 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Explore features
                </a>
              </div>

              <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
                {POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-100 sm:text-sm"
                  >
                    <HiOutlineCheckCircle className="h-4 w-4 text-white" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
