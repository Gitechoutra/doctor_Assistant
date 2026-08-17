import { useEffect } from "react";
import { Link } from "react-router-dom";
import { HiArrowLeft, HiOutlineExclamationTriangle } from "react-icons/hi2";
import Logo from "../../components/Logo";

/**
 * Shared shell for the Privacy Policy and Terms pages.
 *
 * Both carry a visible notice that the text is a starting template, not
 * reviewed legal advice. A practice's privacy policy has to reflect what this
 * deployment actually does with patient data and which regulations apply to
 * it -- neither of which can be inferred from the code.
 */
export default function LegalPage({ title, updated, intro, sections }) {
  // Arriving from a footer link mid-page would otherwise land you scrolled
  // halfway down a document you haven't started reading.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5 lg:px-10">
          <Link to="/" className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <Logo />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
          >
            <HiArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-14 lg:px-10 lg:py-20">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: {updated}</p>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <HiOutlineExclamationTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed text-amber-900">
            <span className="font-semibold">Template — needs legal review. </span>
            This document describes how the software is built, not a policy any
            lawyer has approved. Have it reviewed against the regulations that
            apply to your practice before publishing it.
          </p>
        </div>

        <p className="mt-8 text-base leading-relaxed text-slate-600">{intro}</p>

        <div className="mt-10 space-y-10">
          {sections.map(({ heading, body, items }) => (
            <section key={heading}>
              <h2 className="text-lg font-bold text-slate-900">{heading}</h2>
              {body && (
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{body}</p>
              )}
              {items && (
                <ul className="mt-3 space-y-2">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-3 text-sm leading-relaxed text-slate-600"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row lg:px-10">
          <Logo />
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} MediAssist AI
          </p>
        </div>
      </footer>
    </div>
  );
}
