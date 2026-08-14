import { useEffect, useState } from "react";
import { HiOutlineArchiveBox, HiOutlineCheckCircle } from "react-icons/hi2";
import { addStock, fetchBrandOptions } from "../../services/pharmacyService";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const label = "mb-1 block text-xs font-semibold text-slate-600";

const EMPTY = {
  brand_id: "",
  quantity: "",
  batch_no: "",
  expiry_date: "",
  mrp: "",
  cost_price: "",
};

/**
 * Receives a batch into this branch.
 *
 * There is no branch picker: stock always lands at the counter the pharmacist
 * is signed in to. Posting into someone else's branch is not something a
 * counter should be able to do by filling in a different dropdown.
 */
export default function StockIn() {
  const [brands, setBrands] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    fetchBrandOptions()
      .then(setBrands)
      .catch(() => setErrorMsg("Could not load the medicine list."));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const selected = brands.find((b) => String(b.id) === String(form.brand_id));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const result = await addStock({
        ...form,
        brand_id: Number(form.brand_id),
        quantity: Number(form.quantity),
      });
      setSaved(result);
      setForm(EMPTY);
      // The quantity on every row just changed; refresh so the picker shows
      // the new figure rather than the one from page load.
      fetchBrandOptions().then(setBrands).catch(() => {});
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not receive this stock.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Stock in</h1>
      <p className="mt-1 text-sm text-slate-500">
        Receive a batch into this branch. Same batch number and expiry tops up
        the existing row rather than creating a duplicate.
      </p>

      {saved && (
        <p className="mt-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">
          <HiOutlineCheckCircle className="h-5 w-5" />
          {saved.brand.display_name} — now {saved.brand.quantity} units in stock.
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
      >
        <div>
          <label className={label}>Medicine *</label>
          <select
            required
            className={input}
            value={form.brand_id}
            onChange={update("brand_id")}
          >
            <option value="">Select from the catalogue</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.display_name} — {b.quantity} in stock
              </option>
            ))}
          </select>
          {selected?.used_for && (
            <p className="mt-1.5 text-[11px] text-slate-400">{selected.used_for}</p>
          )}
          {brands.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-600">
              Catalogue is empty — add a medicine first.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Quantity *</label>
            <input
              required
              type="number"
              min="1"
              className={input}
              value={form.quantity}
              onChange={update("quantity")}
            />
          </div>
          <div>
            <label className={label}>Batch number</label>
            <input className={input} value={form.batch_no} onChange={update("batch_no")} />
          </div>
          <div>
            <label className={label}>Expiry date</label>
            <input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              className={input}
              value={form.expiry_date}
              onChange={update("expiry_date")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>MRP (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={input}
              value={form.mrp}
              onChange={update("mrp")}
            />
          </div>
          <div>
            <label className={label}>Cost price (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={input}
              value={form.cost_price}
              onChange={update("cost_price")}
            />
          </div>
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving || brands.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          <HiOutlineArchiveBox className="h-4 w-4" />
          {saving ? "Receiving…" : "Receive stock"}
        </button>
      </form>
    </div>
  );
}
