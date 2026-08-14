import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";

/**
 * The one search box, used by every list in the app.
 *
 * It searches as you type — there is no button, and pressing Enter does
 * nothing special, because by the time you could press it the results are
 * already there. The caller debounces the value it queries with (see
 * `useDebouncedValue`), so this stays a controlled input that updates on every
 * keystroke while the network sees one request per pause.
 *
 * `busy` draws the spinner in place of the magnifier while a query is in
 * flight. Deliberately in place rather than beside: a spinner that appears
 * next to the icon shifts the text, and a search box whose contents move while
 * you type is worse than one that gives no feedback at all.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Search patients by name, ID or phone…",
  busy = false,
  autoFocus = false,
  className = "",
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 ${className}`}
    >
      {busy ? (
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500"
        />
      ) : (
        <HiOutlineMagnifyingGlass className="h-4.5 w-4.5 shrink-0 text-slate-400" />
      )}
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="shrink-0 text-slate-400 transition hover:text-slate-600"
        >
          <HiOutlineXMark className="h-4.5 w-4.5" />
        </button>
      )}
    </div>
  );
}
