import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m, useMotionValueEvent, useScroll } from "framer-motion";
import { HiOutlineArrowRight, HiOutlineBars3, HiOutlineXMark } from "react-icons/hi2";
import Logo from "../Logo";
import { BUTTON_GHOST, FOCUS, NAV_LINK } from "./motion3d";

/**
 * The public header.
 *
 * Three things it has to get right, none of which the old two-item bar did:
 *
 * 1. The portal door is named. The practice signs in at /login and patients
 *    sign in at /portal/login - two separate account tables, two separate
 *    sessions - so an unlabelled "Sign in" would send half the people who
 *    click it to a form that tells them their password is wrong. The header
 *    now carries only the portal link; the practice signs in from the hero.
 * 2. The in-page links actually go somewhere. Every href below matches a real
 *    `id` on the page, and `scroll-margin-top` in index.css keeps the sticky
 *    header off the heading it lands on.
 * 3. It collapses rather than crushes. Below `lg` the links move into a sheet;
 *    below `sm` the practice CTA drops to "Sign in", because a logo plus two
 *    full-width buttons does not fit a 320px screen.
 *
 * The section highlight is an IntersectionObserver rather than a scroll
 * listener - the browser does the intersection maths itself, and a handler
 * that reads `getBoundingClientRect` per section per frame is the classic way
 * to make a landing page feel heavy.
 */

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#why-us", label: "Why MediAssist" },
  { href: "#patients", label: "For patients" },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));

  // Which section is under the header. The band is the top third of the
  // viewport, so a heading counts as "current" once it has settled near the
  // top rather than the moment its first pixel enters at the bottom.
  useEffect(() => {
    const sections = LINKS.map(({ href }) => document.querySelector(href)).filter(Boolean);
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActive(`#${visible[visible.length - 1].target.id}`);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  // The sheet covers the page, so the page behind it must not scroll - on iOS
  // a scrolling body under a fixed overlay is what makes the overlay appear to
  // drift. Restoring the previous value rather than clearing it keeps this
  // from fighting anything else that locks scroll.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Closing on click matters more than it looks: the sheet's links are
  // anchors, and an anchor that scrolls the page behind a covering panel has
  // done nothing the visitor can see.
  const close = () => setOpen(false);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        scrolled
          ? "border-slate-200/80 bg-white/85 shadow-[0_1px_20px_-12px_rgba(51,43,113,0.5)] supports-[backdrop-filter]:backdrop-blur-lg"
          : "border-transparent bg-white/70 supports-[backdrop-filter]:backdrop-blur"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6 lg:px-8">
        <Link to="/" className={`shrink-0 rounded-xl ${FOCUS}`} aria-label="MediAssist AI home">
          <Logo />
        </Link>

        <nav aria-label="Page sections" className="hidden items-center gap-8 lg:flex">
          {LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              aria-current={active === href ? "true" : undefined}
              className={`${NAV_LINK} ${FOCUS} ${
                active === href ? "text-slate-900 after:scale-x-100" : ""
              }`}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link to="/portal/login" className={`hidden ${BUTTON_GHOST} ${FOCUS} sm:inline-flex`}>
            Patient portal
          </Link>

          {/* The practice CTA stood here. It is now the hero's "Sign in" and
              the footer's link only — the header keeps the quieter portal link
              and the menu. /login itself is untouched. */}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className={`grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 lg:hidden ${FOCUS}`}
          >
            {open ? <HiOutlineXMark className="h-5 w-5" /> : <HiOutlineBars3 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <m.div
            id="landing-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-slate-100 bg-white/95 supports-[backdrop-filter]:backdrop-blur-lg lg:hidden"
          >
            <nav aria-label="Page sections" className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
              <ul className="space-y-1">
                {LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <a
                      href={href}
                      onClick={close}
                      className={`flex items-center justify-between rounded-xl px-3 py-3 text-[15px] font-semibold transition ${FOCUS} ${
                        active === href
                          ? "bg-brand-50 text-brand-700"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                      <HiOutlineArrowRight className="h-4 w-4 text-slate-300" />
                    </a>
                  </li>
                ))}
              </ul>

              <Link
                to="/portal/login"
                onClick={close}
                className={`mt-3 flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:hidden ${FOCUS}`}
              >
                Patient portal
              </Link>
            </nav>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}
