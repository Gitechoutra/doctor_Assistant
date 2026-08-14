import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiOutlineClock,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import Modal from "../components/Modal";
import DoctorsTable from "../components/DoctorsTable";
import { useAuth } from "../context/AuthContext";
import { fetchDoctors, createDoctor } from "../services/doctorService";
import { fetchDepartments } from "../services/departmentService";
import { EMAIL_ERROR, EMAIL_HINT, isValidEmail } from "../utils/contact";

// Matches the API's own floor (helpers/search.py): one character comes back
// as the whole directory, which would read as a search that matched everyone.
const MIN_SEARCH_LENGTH = 2;

function AddDoctorModal({ departments, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department_id: "",
    specialization: "",
    registration_no: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const emailInvalid = !isValidEmail(form.email);

  async function handleSubmit(e) {
    e.preventDefault();
    if (emailInvalid) {
      setErrorMsg(EMAIL_ERROR);
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      const doctor = await createDoctor({ ...form, department_id: Number(form.department_id) });
      onCreated(doctor);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not create doctor.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <Modal title="Add Doctor" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Full Name *</label>
          <input required className={inputClass} value={form.name} onChange={update("name")} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Email *</label>
          <input
            type="email"
            required
            placeholder={EMAIL_HINT}
            className={`${inputClass} ${emailInvalid ? "border-red-300" : ""}`}
            value={form.email}
            onChange={update("email")}
          />
          <p className={`mt-1 text-xs ${emailInvalid ? "text-red-600" : "text-slate-400"}`}>
            {emailInvalid ? EMAIL_ERROR : `Must be ${EMAIL_HINT}`}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Temporary Password *
          </label>
          <input
            type="text"
            required
            className={inputClass}
            value={form.password}
            onChange={update("password")}
            placeholder="They can change this after logging in"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Department *</label>
          <select
            required
            className={inputClass}
            value={form.department_id}
            onChange={update("department_id")}
          >
            <option value="">Select a department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Specialization
            </label>
            <input
              className={inputClass}
              value={form.specialization}
              onChange={update("specialization")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Registration No.
            </label>
            <input
              className={inputClass}
              value={form.registration_no}
              onChange={update("registration_no")}
            />
          </div>
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving || emailInvalid}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Creating…" : "Add Doctor"}
        </button>
      </form>
    </Modal>
  );
}

export default function Doctors() {
  const { user } = useAuth();
  const canManageDoctors = user?.role === "admin";

  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // In the URL so the header's search box can land here on a named doctor,
  // and so the filtered list survives a reload.
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchTerm);

  useEffect(() => setSearchInput(searchTerm), [searchTerm]);

  const query = searchTerm.trim();
  // The API's floor: below it the server stops narrowing (helpers/search.py).
  const searching = query.length >= MIN_SEARCH_LENGTH;

  // Depends on the caller's role: only an admin fetches departments, which
  // the add-doctor form needs. Wrapped so the effect below re-runs if the
  // role resolves after mount — the cached user loads asynchronously, and an
  // admin arriving a tick late previously got an empty department list and a
  // form they could not submit.
  const load = useCallback(() => {
    setLoading(true);
    const list = fetchDoctors(undefined, searching ? query : undefined);
    const requests = canManageDoctors ? [list, fetchDepartments()] : [list];
    return Promise.all(requests)
      .then(([d, deps]) => {
        setDoctors(d);
        if (deps) setDepartments(deps);
      })
      .finally(() => setLoading(false));
  }, [canManageDoctors, searching, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced, and replacing rather than pushing: one history entry for the
  // search, not one per character.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === searchTerm) return;
    const id = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (next) params.set("search", next);
      else params.delete("search");
      setSearchParams(params, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput, searchTerm, searchParams, setSearchParams]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Doctors</h1>
          <p className="mt-1 text-sm text-slate-500">
            {doctors.length} doctor{doctors.length === 1 ? "" : "s"}
            {searching && ` matching “${query}”`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* This table says who the doctors are; the front desk also needs to
              know when they are in. Reception's route into it — the sidebar
              carries the same link. */}
          <Link
            to="/dashboard/doctors/availability"
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <HiOutlineClock className="h-4 w-4" />
            Availability
          </Link>
          {canManageDoctors && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              <HiOutlinePlus className="h-4 w-4" />
              Add Doctor
            </button>
          )}
        </div>
      </div>

      {/* Name, speciality or department. The server matches, so this reaches
          every doctor rather than only the page already loaded. */}
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 sm:max-w-md">
        <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search doctors"
          placeholder="Search by name, speciality or department…"
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        )}
      </div>

      {searchInput.trim().length === 1 && (
        <p className="mt-2 text-xs text-slate-400">
          Keep typing — at least {MIN_SEARCH_LENGTH} characters.
        </p>
      )}

      <div className="mt-5">
        {loading ? (
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : doctors.length === 0 && searching ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <p className="mx-auto max-w-lg text-sm text-slate-400">
              No doctor matches “{query}”. Names, specialities and departments
              are all searched.
              <button
                onClick={() => setSearchInput("")}
                className="ml-1 font-semibold text-brand-600 underline underline-offset-2"
              >
                Clear the search
              </button>
            </p>
          </div>
        ) : (
          <DoctorsTable doctors={doctors} />
        )}
      </div>

      {showAddModal && (
        <AddDoctorModal
          departments={departments}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}
