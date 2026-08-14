import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlinePlus, HiOutlineBuildingOffice2 } from "react-icons/hi2";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { fetchDepartments, createDepartment } from "../services/departmentService";

function AddDepartmentModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const department = await createDepartment({ name });
      onCreated(department);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not create department.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Department" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Department Name *
          </label>
          <input
            required
            autoFocus
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cardiology"
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Creating…" : "Add Department"}
        </button>
      </form>
    </Modal>
  );
}

export default function Departments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageDepartments = user?.role === "admin";

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  function load() {
    setLoading(true);
    fetchDepartments()
      .then(setDepartments)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Departments</h1>
          <p className="mt-1 text-sm text-slate-500">
            {departments.length} department{departments.length === 1 ? "" : "s"}
          </p>
        </div>
        {canManageDepartments && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Add Department
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-100 bg-white py-12 text-center shadow-sm">
          <p className="text-sm text-slate-400">No departments yet.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => (
            <button
              key={d.id}
              onClick={() => navigate(`/dashboard/departments/${d.id}`)}
              className="rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:border-brand-200 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
                  <HiOutlineBuildingOffice2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{d.name}</p>
                  <p className="text-xs text-slate-400">
                    {d.doctor_count} doctor{d.doctor_count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddDepartmentModal
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
