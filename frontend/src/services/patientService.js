import api from "./api";

/**
 * The practice's patients.
 *
 *   all       (default) everyone on the books — the Patients page
 *   consulted seen and finished, and not booked in again right now
 *   awaiting  booked, waiting or in consultation
 *
 * `search` narrows by name, patient code, phone or email, matching any part
 * of any of them — "rah" finds Rahul. It only ever narrows: the server scopes
 * the result to what the caller may see either way.
 */
export async function fetchPatients(scope = "all", search, limit) {
  const params = { scope };
  if (search) params.search = search;
  if (limit) params.limit = limit;
  const res = await api.get("/patients", { params });
  return res.data.data;
}

/** How many patients sit in each scope, for the tab labels. */
export async function fetchPatientCounts() {
  const res = await api.get("/patients/counts");
  return res.data.data;
}

/** One patient record, full detail. */
export async function fetchPatient(patientId) {
  const res = await api.get(`/patients/${patientId}`);
  return res.data.data;
}

/**
 * Registers a patient. PA only.
 *
 * `book_now: true` also puts them in today's queue, in the same transaction —
 * the walk-in case. Without it the patient is simply added to the books.
 */
export async function createPatient(payload) {
  const res = await api.post("/patients", payload);
  return res.data.data;
}

/** Corrects registration details. Open to the PA and to the doctor. */
export async function updatePatient(patientId, payload) {
  const res = await api.patch(`/patients/${patientId}`, payload);
  return res.data.data;
}

/**
 * Removes a registration that should never have existed. PA only, and the
 * server refuses any patient with a consultation or a case — those are
 * medical records and are kept.
 */
export async function deletePatient(patientId) {
  const res = await api.delete(`/patients/${patientId}`);
  return res.data.data;
}

export async function uploadPatientPhoto(patientId, file) {
  const form = new FormData();
  form.append("photo", file);
  const res = await api.post(`/patients/${patientId}/photo`, form);
  return res.data.data;
}

export async function removePatientPhoto(patientId) {
  const res = await api.delete(`/patients/${patientId}/photo`);
  return res.data.data;
}
