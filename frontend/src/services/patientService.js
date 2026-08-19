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
 *
 * `range` is `{ date_from, date_to }`, both YYYY-MM-DD and both inclusive,
 * against the registration date. Sent to the server rather than filtered here
 * so that "registered in August" means the same thing however many patients
 * the practice has — a browser-side filter can only narrow the page it was
 * given, which is a different question wearing the same label.
 *
 * Search and range compose: both are applied, so "Ramu, this month" is one
 * request and one answer.
 */
export async function fetchPatients(scope = "all", search, limit, range = {}) {
  const params = { scope };
  if (search) params.search = search;
  if (limit) params.limit = limit;
  if (range.date_from) params.date_from = range.date_from;
  if (range.date_to) params.date_to = range.date_to;
  const res = await api.get("/patients", { params });
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
 * Always raises an appointment with the patient's doctor, in the same
 * transaction, so a registration can never leave somebody on the books with
 * nothing in Appointments and nobody told they are coming. `book_now` chooses
 * which kind: true (the default when omitted) checks them straight into
 * today's queue, false books them in for later, under Upcoming.
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
