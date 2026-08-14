import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlineCheckCircle } from "react-icons/hi2";
import MedicineForm from "../../components/pharmacy/MedicineForm";
import { createBrand } from "../../services/pharmacyService";

/**
 * Adds a medicine to the hospital-wide catalogue, filed under its departments.
 *
 * Catalogue only — no quantity here. A product existing and a branch holding
 * some of it are different facts, and conflating them is what makes
 * cross-branch search impossible. Stock is received separately under Stock In.
 *
 * The same form is used in the edit modal on the Medicines page, so the two
 * cannot drift apart on fields or validation.
 */
export default function AddMedicine() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(null);
  // Remounts the form after a save so it comes back empty, ready for the next
  // medicine — adding a batch of them one after another is the normal case.
  const [formKey, setFormKey] = useState(0);

  async function handleSubmit(payload) {
    setSaving(true);
    setErrorMsg("");
    try {
      const brand = await createBrand(payload);
      setSaved(brand);
      setFormKey((k) => k + 1);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not add this medicine.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Add medicine</h1>
      <p className="mt-1 text-sm text-slate-500">
        Adds it to the catalogue for every branch and files it under the departments you
        choose. Receive quantity separately under Stock In.
      </p>

      {saved && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <HiOutlineCheckCircle className="h-5 w-5 shrink-0" />
            {saved.display_name} added to{" "}
            {saved.for_all_departments
              ? "all departments"
              : saved.departments.map((d) => d.name).join(", ") || "the catalogue"}
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate("/pharmacy/stock/in")}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
            >
              Receive stock for it
            </button>
            <button
              onClick={() => navigate("/pharmacy/medicines/inventory")}
              className="rounded-xl border border-emerald-300 px-4 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
            >
              View medicines
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <MedicineForm
          key={formKey}
          defaultDepartmentId={searchParams.get("department_id")}
          saving={saving}
          errorMsg={errorMsg}
          submitLabel="Add to catalogue"
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
