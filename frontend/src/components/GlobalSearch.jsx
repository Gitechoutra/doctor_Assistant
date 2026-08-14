import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";
import Avatar from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { fetchDoctors } from "../services/doctorService";
import { fetchPatients } from "../services/patientService";
import { MIN_SEARCH_LENGTH } from "../utils/search";

// MIN_SEARCH_LENGTH matches the server's own floor (helpers/search.py). Below
// it the API stops narrowing and answers with the whole list, which would read
// as "the search found everyone" — so a single character waits for the second.

// Long enough that typing a name is one request rather than eight.
const DEBOUNCE_MS = 250;

// Per section. The dropdown is a way to jump straight to a person, not a
// results page — anything longer than this belongs on Patients or Doctors,
// which is what the last row offers.
const MAX_PER_GROUP = 5;

/**
 * The search box in the dashboard header.
 *
 * Searches the two things somebody looks up by name from anywhere in the
 * hospital — a patient and a doctor — and jumps straight to them.
 *
 * Every result comes from the API rather than from a list already in the
 * browser, so what it can find is exactly what the caller is allowed to see:
 * a doctor searching finds their own patients, because `/patients` scopes to
 * them. Doctors are only searched for the roles that have a doctor directory
 * to land on; for a doctor the section is not requested at all rather than
 * offered and then 403'd.
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Mirrors ADMIN_ONLY_DENY in the router: a doctor has no /dashboard/doctors
  // to be sent to, so offering them a doctor result would be a dead end.
  const canSearchDoctors = user?.role !== "doctor";

  const [term, setTerm] = useState("");
  const [results, setResults] = useState({ patients: [], doctors: [] });
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
      setResults({ patients: [], doctors: [] });
      setLoading(false);
      setFailed(false);
      return;
    }

    const mine = ++ticket.current;
    setLoading(true);
    const timer = setTimeout(() => {
      Promise.all([
        // `all`, not the Patients page's default: somebody looked up by name
        // is just as likely to be waiting in Appointments as to have been
        // seen, and a search that quietly excludes half the hospital is the
        // bug this box is here to fix.
        fetchPatients("all", query).catch(() => null),
        canSearchDoctors ? fetchDoctors(undefined, query).catch(() => null) : null,
      ]).then(([patients, doctors]) => {
        if (mine !== ticket.current) return;
        setFailed(patients === null && doctors === null);
        setResults({
          patients: (patients || []).slice(0, MAX_PER_GROUP),
          doctors: (doctors || []).slice(0, MAX_PER_GROUP),
        });
        setActive(0);
        setLoading(false);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, ready, canSearchDoctors]);

  // One flat list behind the two rendered sections, so the arrow keys can walk
  // the dropdown without caring where a section ends.
  const rows = useMemo(() => {
    const patients = results.patients.map((p) => ({
      key: `patient-${p.id}`,
      kind: "patient",
      title: p.name,
      subtitle: [p.code, p.phone, p.assigned_doctor?.name && `Dr. ${p.assigned_doctor.name}`]
        .filter(Boolean)
        .join(" · "),
      imageUrl: p.photo_url,
      // The code rather than the typed words: it matches one patient and only
      // that patient, so the page it lands on cannot show anybody else.
      to: `/dashboard/patients?search=${encodeURIComponent(p.code || p.name)}`,
    }));
    const doctors = results.doctors.map((d) => ({
      key: `doctor-${d.id}`,
      kind: "doctor",
      title: `Dr. ${d.name}`,
      subtitle: [d.department, d.specialization].filter(Boolean).join(" · "),
      to: `/dashboard/doctors?search=${encodeURIComponent(d.name)}`,
    }));
    return [...patients, ...doctors];
  }, [results]);

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
          aria-label={canSearchDoctors ? "Search patients and doctors" : "Search patients"}
          autoComplete="off"
          placeholder={canSearchDoctors ? "Search patients, doctors…" : "Search patients…"}
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
            ["patient", "doctor"].map((kind) => {
              const group = rows.filter((r) => r.kind === kind);
              if (!group.length) return null;
              return (
                <div key={kind}>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {kind === "patient" ? "Patients" : "Doctors"}
                  </p>
                  {group.map((row) => {
                    const index = rows.indexOf(row);
                    return (
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
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
