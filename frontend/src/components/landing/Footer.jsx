import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineArrowUp,
  HiOutlineChatBubbleLeftRight,
  HiOutlineEnvelope,
  HiOutlineMapPin,
  HiOutlinePhone,
} from "react-icons/hi2";
import {
  FaFacebookF,
  FaGithub,
  FaInstagram,
  FaLinkedinIn,
  FaXTwitter,
} from "react-icons/fa6";
import { APP_VERSION, FOOTER_LINKS, HOSPITAL } from "./content";

// href is "#" because this is a template — point each at the real profile
// before launch. rel="noreferrer" is set regardless so it stays correct.
const SOCIALS = [
  { label: "LinkedIn", icon: FaLinkedinIn, href: "#" },
  { label: "GitHub", icon: FaGithub, href: "#" },
  { label: "X (Twitter)", icon: FaXTwitter, href: "#" },
  { label: "Facebook", icon: FaFacebookF, href: "#" },
  { label: "Instagram", icon: FaInstagram, href: "#" },
];

const CONTACT = [
  { icon: HiOutlineEnvelope, label: HOSPITAL.email, href: `mailto:${HOSPITAL.email}` },
  {
    icon: HiOutlinePhone,
    label: HOSPITAL.phone,
    // Strip spaces so the dialler gets a clean number.
    href: `tel:${HOSPITAL.phone.replace(/\s+/g, "")}`,
  },
  { icon: HiOutlineMapPin, label: HOSPITAL.address },
];

function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toTop() {
    // Honour the OS preference here too: `scroll-behavior: smooth` in CSS does
    // not apply to scrollTo called with an explicit behavior.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-900/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <HiOutlineArrowUp className="h-5 w-5" />
    </button>
  );
}

export default function Footer() {
  return (
    <>
      <footer className="relative overflow-hidden bg-slate-900 text-slate-300">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">
                  <HiOutlineChatBubbleLeftRight className="h-5 w-5" />
                </div>
                <div className="leading-tight">
                  <p className="text-base font-bold text-white">Yasodha</p>
                  <p className="text-[11px] font-medium text-slate-400">
                    AI Medical Assistant
                  </p>
                </div>
              </div>

              <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-400">
                An AI-powered consultation platform for hospitals. Doctors and
                patients talk; the system transcribes, summarises, drafts a
                formulary-matched prescription and carries the patient through
                nursing care to a signed report.
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                {SOCIALS.map(({ label, icon: Icon, href }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition duration-300 hover:-translate-y-1 hover:border-brand-400/50 hover:bg-brand-600 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
              <div key={heading} className="lg:col-span-2">
                <h3 className="text-sm font-bold text-white">{heading}</h3>
                <ul className="mt-4 space-y-2.5">
                  {links.map(({ label, href, to }) => {
                    const classes =
                      "group inline-flex items-center text-sm text-slate-400 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";
                    const inner = (
                      <>
                        <span className="mr-0 h-px w-0 bg-brand-400 transition-all duration-300 group-hover:mr-2 group-hover:w-3" />
                        {label}
                      </>
                    );
                    return (
                      <li key={label}>
                        {to ? (
                          <Link to={to} className={classes}>
                            {inner}
                          </Link>
                        ) : (
                          <a href={href} className={classes}>
                            {inner}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            <div id="contact" className="md:col-span-2 lg:col-span-4">
              <h3 className="text-sm font-bold text-white">Contact</h3>
              <ul className="mt-4 space-y-3.5">
                {CONTACT.map(({ icon: Icon, label, href }) => (
                  <li key={label}>
                    {href ? (
                      <a
                        href={href}
                        className="flex items-start gap-3 text-sm text-slate-400 transition hover:text-white"
                      >
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
                          <Icon className="h-4 w-4 text-brand-300" />
                        </span>
                        <span className="pt-1.5">{label}</span>
                      </a>
                    ) : (
                      <div className="flex items-start gap-3 text-sm text-slate-400">
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
                          <Icon className="h-4 w-4 text-brand-300" />
                        </span>
                        <span className="pt-1.5 leading-relaxed">{label}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
            <p className="text-center text-xs text-slate-500 sm:text-left">
              © {new Date().getFullYear()} {HOSPITAL.name}. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <Link to="/privacy" className="text-xs text-slate-500 transition hover:text-white">
                Privacy Policy
              </Link>
              <Link to="/terms" className="text-xs text-slate-500 transition hover:text-white">
                Terms &amp; Conditions
              </Link>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                v{APP_VERSION}
              </span>
            </div>
          </div>
        </div>
      </footer>

      <BackToTop />
    </>
  );
}
