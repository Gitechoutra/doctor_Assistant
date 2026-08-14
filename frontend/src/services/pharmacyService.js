import api from "./api";

/** Counter dashboard figures for the caller's own branch. */
export async function fetchPharmacySummary() {
  const res = await api.get("/pharmacy/summary");
  return res.data.data;
}

export async function fetchBranches() {
  const res = await api.get("/pharmacy/branches");
  return res.data.data;
}

/**
 * The catalogue, filtered and paged, each row carrying this branch's quantity.
 *
 * Returns `{ branch, items, meta }`. Accepts { department_id, search, category,
 * manufacturer, form, availability, status, page, page_size } — filtering and
 * paging happen server-side so the page stays fast as the catalogue grows.
 */
export async function fetchBrands(params = {}) {
  const res = await api.get("/pharmacy/brands", { params });
  return res.data.data;
}

/** Just the rows, for callers that only need a picker (e.g. Stock In). */
export async function fetchBrandOptions(params = {}) {
  const { items } = await fetchBrands({ page_size: 100, ...params });
  return items;
}

export async function fetchBrand(brandId) {
  const res = await api.get(`/pharmacy/brands/${brandId}`);
  return res.data.data;
}

export async function createBrand(payload) {
  const res = await api.post("/pharmacy/brands", payload);
  return res.data.data;
}

export async function updateBrand(brandId, payload) {
  const res = await api.patch(`/pharmacy/brands/${brandId}`, payload);
  return res.data.data;
}

/**
 * Removes a medicine from the catalogue.
 *
 * Returns `{ deleted }`. False means the server archived it instead — a
 * medicine that has been prescribed or still holds stock is discontinued
 * rather than erased, so patient history survives. The accompanying message
 * explains which happened.
 */
export async function deleteBrand(brandId) {
  const res = await api.delete(`/pharmacy/brands/${brandId}`);
  return { ...res.data.data, message: res.data.message };
}

/** Every department with its medicine and stock counts. */
export async function fetchDepartmentInventory() {
  const res = await api.get("/pharmacy/departments");
  return res.data.data;
}

export async function fetchCategories() {
  const res = await api.get("/pharmacy/categories");
  return res.data.data;
}

/**
 * Returns `{ in_branch, other_branches }`. Anything this counter cannot
 * dispense is looked up across the other branches so it can be transferred in.
 */
export async function searchMedicines(q) {
  const res = await api.get("/pharmacy/search", { params: { q } });
  return res.data.data;
}

export async function fetchInventory(params = {}) {
  const res = await api.get("/pharmacy/inventory", { params });
  return res.data.data;
}

/** Receives stock. Always lands in the caller's own branch. */
export async function addStock(payload) {
  const res = await api.post("/pharmacy/stock", payload);
  return res.data.data;
}

export async function fetchLowStock() {
  const res = await api.get("/pharmacy/low-stock");
  return res.data.data;
}

export async function fetchExpiring() {
  const res = await api.get("/pharmacy/expired");
  return res.data.data;
}

/**
 * Medicines doctors had to write by hand because the catalogue lacks them.
 * `status` is pending | added | dismissed | all.
 */
export async function fetchMedicineRequests(status = "pending") {
  const res = await api.get("/pharmacy/medicine-requests", { params: { status } });
  return res.data.data;
}

/** Adds a requested medicine to the catalogue and closes the request. */
export async function addRequestedMedicine(requestId, payload) {
  const res = await api.post(`/pharmacy/medicine-requests/${requestId}/add`, payload);
  return res.data.data;
}

/**
 * Rejects a doctor-added medicine and takes it back out of the catalogue.
 *
 * The message says which happened — removed outright, or discontinued because
 * it has already been prescribed and those prescriptions must keep resolving.
 */
export async function dismissMedicineRequest(requestId, reviewNote) {
  const res = await api.post(`/pharmacy/medicine-requests/${requestId}/dismiss`, {
    review_note: reviewNote,
  });
  return { ...res.data.data, message: res.data.message };
}
