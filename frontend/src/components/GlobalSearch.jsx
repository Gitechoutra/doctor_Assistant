import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";
import Avatar from "./Avatar";
import { fetchPatients } from "../services/patientService";
import { MIN_SEARCH_LENGTH } from "../utils/search";

// MIN_SEARCH_LENGTH matches the server's own floor (helpers/search.py). Below
// it the API stops narrowing and answers with the whole list, which would read
// as "the search found everyone" — so a single character waits for the second.

// Long enough that typing a name is one request rather than eight.
const DEBOUNCE_MS = 250;

// The dropdown is a way to jump straight to a person, not a results page —
// anything longer belongs on the Patients page, which Enter falls back to.
const MAX_RESULTS = 6;

/**
 * The search box in the dashboard header.
 *
 * Patients only. The hospital version also searched a doctor directory, which
 * a one-doctor practice does not have — there is nobody to look up, and the
 * page it jumped to is gone.
 *
 * Every result comes from the API rather than from a list already in the
 * browser, so what it finds is exactly what the caller is allowed to see.
 * Choosing one opens that patient's record by id rather than a filtered list:
 * one person, one page.
 */
export default function GlobalSearch() {
  const navigate = useNavigate();

  const [term, setTerm] = useState("");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  const boxRef = useRef(null);
  const inputRef = useRef(null);
  // Bumped on every keystroke. A response is applied only if its ticket is
  // still the current one: "arj" resolving after "arjun" would otherwise
  // repaint the list with matches for something the user has moved past.
  const ticket = useRef(0);

  const query = term.trim();
  const ready = query.length >= MIN_SEARCH_LENGTH;

  useEffect(() => {
    if (!ready) {
      setPatients([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    const mine = ++ticket.current;
    setLoading(true);
    const timer = setTimeout(() => {
      // `all`, not the Patients page's default scope: somebody looked up by
      // name is just as likely to be booked in as to have been seen, and a
      // search that quietly excludes half of them is the bug this box exists
      // to avoid.
      fetchPatients("all", query, MAX_RESULTS)
        .catch(() => null)
        .then((rows) => {
          if (mine !== ticket.current) return;
          setFailed(rows === null);
          setPatients((rows || []).slice(0, MAX_RESULTS));
          setActive(0);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, ready]);

  const rows = useMemo(
    () =>
      patients.map((p) => ({
        key: `patient-${p.id}`,
        title: p.name,
        subtitle: [p.code, p.phone, p.age != null ? `${p.age} yrs` : null]
          .filter(Boolean)
          .join(" · "),
        imageUrl: p.photo_url,
        // Straight to the record, by id. Landing on a filtered list instead
        // would show the person searched for alongside everybody else who
        // happened to match the same few letters.
        to: `/dashboard/patients/${p.id}`,
      })),
    [patients]
  );

  const close = useCallback(() => {
    setOpen(false);
    setActive(0);
  }, []);

  function choose(row) {
    if (!row) return;
    close();
    setTerm("");
    navigate(row.to);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      close();
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!rows.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter with nothing highlighted still has to do something useful, or
      // the box feels broken: fall back to the full patient list for the term.
      if (rows.length) choose(rows[active]);
      else if (ready) {
        close();
        navigate(`/dashboard/patients?search=${encodeURIComponent(query)}`);
      }
    }
  }

  // A click anywhere else dismisses the dropdown. Pointerdown rather than
  // click so it closes before a navigation elsewhere on the page starts.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (!boxRef.current?.contains(e.target)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const showDropdown = open && query.length > 0;

  return (
    /* Hidden on the smallest screens: at 375px the search box and the action
       buttons cannot both fit, and the buttons are what a user reaches for on
       a phone. */
    <div ref={boxRef} className="relative hidden w-full max-w-sm sm:block">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 focus-within:border-brand-300 focus-within:bg-white">
        <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
          aria-label="Search patients"
          autoComplete="off"
          placeholder="Search patients by name, ID or phone…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
        {term && (
          <button
            type="button"
            onClick={() => {
              setTerm("");
              close();
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl"
        >
          {!ready ? (
            <p className="px-3 py-2.5 text-sm text-slate-400">
              Keep typing — at least {MIN_SEARCH_LENGTH} characters.
            </p>
          ) : loading ? (
            <p className="px-3 py-2.5 text-sm text-slate-400">Searching…</p>
          ) : failed ? (
            <p className="px-3 py-2.5 text-sm text-red-600">
              Could not run that search. Check your connection and try again.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-slate-500">
              Nothing matches “{query}”.
            </p>
          ) : (
            rows.map((row, index) => (
              <button
                key={row.key}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(row)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                  index === active ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <Avatar name={row.title} imageUrl={row.imageUrl} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {row.title}
                  </span>
                  {row.subtitle && (
                    <span className="block truncate text-xs text-slate-400">
                      {row.subtitle}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
