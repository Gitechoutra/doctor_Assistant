import api from "./api";

/**
 * Medicines this doctor can prescribe, matching `query`.
 *
 * Reads the pharmacy's catalogue, already narrowed server-side to the
 * doctor's own department and to what is in stock — so anything this returns
 * can actually be dispensed today. An empty query returns the first page of
 * that inventory, so opening the picker shows options rather than a blank box.
 */
export async function searchMedicines(query = "") {
  const res = await api.get("/prescriptions/medicines", { params: { q: query } });
  return res.data.data;
}

/**
 * The prescription history: every prescription written, with the symptoms and
 * diagnosis behind it. Accepts { search, patient_id, period, verified, page }.
 */
export async function fetchPrescriptions(params = {}) {
  const res = await api.get("/prescriptions", { params });
  return res.data.data;
}

export async function fetchPrescription(consultationId) {
  const res = await api.get(`/prescriptions/${consultationId}`);
  return res.data.data;
}
