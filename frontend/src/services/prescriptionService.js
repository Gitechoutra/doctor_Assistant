import api from "./api";

/**
 * Medicines the doctor can prescribe, matching `query`.
 *
 * The practice's own catalogue. An empty query returns its first page, so
 * opening the picker shows options rather than a blank box.
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
