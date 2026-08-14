import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiArrowRight, HiOutlineBars3, HiOutlineXMark } from "react-icons/hi2";
import Logo from "../Logo";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Why us", href: "#why-us" },
  { label: "Dashboards", href: "#dashboards" },
  { label: "FAQ", href: "#faq" },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The bar is transparent over the hero and turns solid once you leave it,
  // so the logo stays legible against the page rather than the gradient.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A fixed panel over a scrollable page is disorienting; lock the body while
  // the mobile menu is open and restore whatever was there before.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-slate-200/70 bg-white/80 py-3 shadow-sm backdrop-blur-xl"
          : "border-b border-transparent py-5"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-10">
        <a href="#top" className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
          <Logo />
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100/80 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden rounded-full border border-slate-200 bg-white/70 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-brand-300 hover:text-brand-700 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to="/login"
            className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:shadow-xl hover:shadow-brand-500/40 sm:inline-flex"
          >
            Get Started
            <HiArrowRight className="h-3.5 w-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 backdrop-blur transition hover:bg-white lg:hidden"
          >
            {menuOpen ? (
              <HiOutlineXMark className="h-5 w-5" />
            ) : (
              <HiOutlineBars3 className="h-5 w-5" />
            )}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="mx-4 mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/10 lg:hidden">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {label}
            </a>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <Link
              to="/login"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700"
            >
              Sign in
            </Link>
            <Link
              to="/login"
              className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-md"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
