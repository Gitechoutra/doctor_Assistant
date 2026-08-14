import { HiOutlineXMark } from "react-icons/hi2";

/**
 * `wide` is for forms with side-by-side fields — a medicine record has enough
 * of them that the default column would stack every pair. `wide="xl"` is
 * wider still, for content that's a grid of cards rather than a form (e.g. a
 * doctor's patient queue) — three record-card columns need more room than
 * two form columns do. The body scrolls rather than the page, so a tall form
 * never pushes its own buttons off screen.
 */
export default function Modal({ title, onClose, children, wide = false }) {
  const maxWidth = wide === "xl" ? "max-w-6xl" : wide ? "max-w-3xl" : "max-w-lg";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div
        className={`flex max-h-full w-full flex-col rounded-2xl bg-white p-6 shadow-2xl ${maxWidth}`}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
