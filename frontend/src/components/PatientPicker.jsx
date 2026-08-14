import { useCallback, useEffect, useRef, useState } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";
import Avatar from "./Avatar";
import { fetchPatients } from "../services/patientService";
import { MIN_SEARCH_LENGTH } from "../utils/search";

// Long enough that typing a name is one request rather than eight.
const DEBOUNCE_MS = 250;

// A picker is a way to reach one person, not a results page. Past this the
// list stops being scannable and the answer is to type another letter.
const MAX_RESULTS = 8;

const inputWrapClass =
  "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100";

/**
 * Pick a patient by typing their name.
 *
 * Replaces the plain `<select>` these forms used to carry. A dropdown of every
 * patient in the hospital is only usable while the hospital is small: it is
 * ordered by whenever the record happened to be created, the browser's own
 * type-ahead only matches from the first letter, and it cannot match a phone
 * number or the code on the patient's card at all. Reception knows the name.
 *
 * The matching is the server's (`/patients?search=`), not a filter over a list
 * already downloaded, which means two things worth having: what it can find is
 * exactly what the caller is allowed to see — a doctor searching finds their
 * own patients, because the endpoint scopes to them — and a partial,
 * case-insensitive, out-of-order name works the same here as everywhere else.
 *
 * `scope` is passed through to the endpoint: "all" (the default) for a picker
 * that must be able to reach any patient, "awaiting" or "consulted" to offer
 * only one side of the journey.
 */
export default function PatientPicker({
  value,
  onChange,
  scope = "all",
  label = "Patient",
  required = false,
  disabled = false,
  placeholder = "Type a patient's name, ID or phone…",
  hint,
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The chosen patient, kept whole so the field can show who is selected
  // rather than an id the person filling the form cannot read back.
  const [selected, setSelected] = useState(null);

  const boxRef = useRef(null);
  const inputRef = useRef(null);
  // Bumped per keystroke. A response is applied only if its ticket is still
  // current: "arj" landing after "arjun" would otherwise repaint the list with
  // matches for something the user has already typed past.
  const ticket = useRef(0);

  const query = term.trim();
  const ready = query.length >= MIN_SEARCH_LENGTH;

  // A form reset (or a parent clearing the field) has to clear the chip too,
  // or the box goes on naming a patient that is no longer selected.
  useEffect(() => {
    if (!value) setSelected(null);
  }, [value]);

  useEffect(() => {
    if (!ready) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return undefined;
    }
    const mine = ++ticket.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchPatients(scope, query)
        .then((rows) => {
          if (mine !== ticket.current) return;
          setResults(rows.slice(0, MAX_RESULTS));
          setFailed(false);
          setActive(0);
        })
        .catch(() => {
          if (mine !== ticket.current) return;
          setResults([]);
          setFailed(true);
        })
        .finally(() => {
          if (mine === ticket.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, ready, scope]);

  const close = useCallback(() => {
    setOpen(false);
    setActive(0);
  }, []);

  function choose(patient) {
    if (!patient) return;
    setSelected(patient);
    onChange(patient);
    setTerm("");
    close();
  }

  function clear() {
    setSelected(null);
    onChange(null);
    setTerm("");
    close();
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
      return;
    }
    if (e.key === "Enter") {
      // Never let picking a name submit the form around it — the patient is
      // the first field, and Enter here means "this one", not "save".
      e.preventDefault();
      if (results.length) choose(results[active]);
    }
  }

  // A click anywhere else dismisses the list. Pointerdown rather than click so
  // it closes before anything else on the form takes focus.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (!boxRef.current?.contains(e.target)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const showDropdown = open && query.length > 0;

  return (
    <div ref={boxRef} className="relative">
      {label && (
        <label className="mb-1 block text-xs font-semibold text-slate-600">
          {label}
          {required && " *"}
        </label>
      )}

      {selected ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2">
          <Avatar name={selected.name} imageUrl={selected.photo_url} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-800">
              {selected.name}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {[selected.code, selected.phone].filter(Boolean).join(" · ")}
            </span>
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              aria-label="Choose a different patient"
              className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
            >
              <HiOutlineXMark className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className={inputWrapClass}>
          <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-label={label || "Search patients"}
            autoComplete="off"
            disabled={disabled}
            placeholder={placeholder}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="shrink-0 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <HiOutlineXMark className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {hint && !selected && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}

      {showDropdown && !selected && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl"
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
          ) : results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-slate-500">
              No patient matches “{query}”.
            </p>
          ) : (
            results.map((patient, index) => (
              <button
                key={patient.id}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(patient)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                  index === active ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <Avatar name={patient.name} imageUrl={patient.photo_url} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {patient.name}
                  </span>
                  <span className="block truncate text-xs text-slate-400">
                    {[
                      patient.code,
                      patient.phone,
                      patient.assigned_doctor?.name && `Dr. ${patient.assigned_doctor.name}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
