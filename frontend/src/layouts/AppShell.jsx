import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { HiOutlineBars3, HiOutlineXMark } from "react-icons/hi2";

/**
 * The sidebar-and-content frame every module sits in.
 *
 * The sidebar used to be a fixed 16rem column with no small-screen handling,
 * which on a phone consumed two thirds of the width and left the content
 * unusable.
 *
 * Below `lg` the sidebar becomes a drawer over the content, opened from a
 * button in the header. From `lg` up it is a normal column again, and the
 * drawer machinery costs nothing because the toggle is hidden.
 */
export default function AppShell({ sidebar, header, children }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Navigating is the end of what the drawer was opened for. Without this it
  // stays over the page the user just chose.
  useEffect(() => setOpen(false), [pathname]);

  // Escape closes it, matching every other overlay in the app.
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Dims and captures clicks while the drawer is open. Hidden from
          assistive tech: the close button is the labelled control. */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {open && (
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-800 lg:hidden"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        )}
        {sidebar}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-white pl-2 lg:pl-0">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-50 lg:hidden"
          >
            <HiOutlineBars3 className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">{header}</div>
        </div>

        {/* Padding tightens on small screens — 2rem either side of a 375px
            viewport leaves very little for the content itself. */}
        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
