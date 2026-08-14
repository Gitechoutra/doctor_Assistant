import { HiOutlineXMark } from "react-icons/hi2";

/**
 * Shows which filter a page arrived with (e.g. from a dashboard card) and
 * lets the user drop it. Without this, a filtered list is indistinguishable
 * from an empty one.
 */
export default function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-brand-700">
      {label}
      <button
        onClick={onClear}
        aria-label={`Clear filter: ${label}`}
        className="grid h-5 w-5 place-items-center rounded-full text-brand-500 transition hover:bg-brand-100 hover:text-brand-700"
      >
        <HiOutlineXMark className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
