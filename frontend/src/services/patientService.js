import api from "./api";

/**
 * The patient list for one stage of the journey.
 *
 *   consulted (default) seen and finished — what the Patients page shows
 *   awaiting            registered but never seen, or in Appointments now
 *   all                 everything, for pickers that must offer any patient
 *
 * A patient is never in both consulted and awaiting: going back into the
 * queue moves them to awaiting until that consultation finishes too.
 *
 * `search` narrows the list by name, patient code, phone or email. It only
 * ever narrows — the server scopes the result to what the caller may see
 * either way, so a doctor searching still sees only their own patients.
 */
export async function fetchPatients(scope = "consulted", search) {
  const params = { scope };
  if (search) params.search = search;
  const res = await api.get("/patients", { params });
  return res.data.data;
}

/** How many patients sit on each side of the split, for the tab labels. */
export async function fetchPatientCounts() {
  const res = await api.get("/patients/counts");
  return res.data.data;
}

/** One patient record, full detail — for a page that already knows the id
 * (an Emergency Case, a nursing record) rather than browsing the list. */
export async function fetchPatient(patientId) {
  const res = await api.get(`/patients/${patientId}`);
  return res.data.data;
}

export async function createPatient(payload) {
  const res = await api.post("/patients", payload);
  return res.data.data;
}

// Front-desk only (admin/receptionist): routes a patient to the doctor who
// will treat them, which is also what decides who can see the record.
export async function assignPatientDoctor(patientId, doctorId) {
  const res = await api.patch(`/patients/${patientId}/assignment`, {
    assigned_doctor_id: doctorId,
  });
  return res.data.data;
}

// Front-desk only (admin/receptionist): removes a registration that should
// never have existed. The server refuses any patient with a consultation,
// case or nursing record — those are medical records and are kept.
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

// Corrects registration details. Open to the front desk and the treating
// doctor; the server rejects nurses and ignores any attempt to change the
// assigned doctor through this route.
export async function updatePatient(patientId, payload) {
  const res = await api.patch(`/patients/${patientId}`, payload);
  return res.data.data;
}

/**
 * The surgical pathway — doctor-only, and the gate on nurse assignment.
 *
 * A patient with `surgery_stage === null` needs no surgery and is never
 * offered a nurse: the API refuses the hand-off, not just the UI. The stages
 * run required → post_op → ready_for_discharge, and discharge clears it.
 */
export async function markSurgeryRequired(patientId, payload = {}) {
  const res = await api.post(`/patients/${patientId}/surgery`, payload);
  return res.data.data;
}

/** Takes the case back off the pathway. Refused once a nurse is watching. */
export async function clearSurgery(patientId) {
  const res = await api.delete(`/patients/${patientId}/surgery`);
  return res.data.data;
}

/** Operated: starts the post-operative observation clock. */
export async function completeSurgery(patientId, payload = {}) {
  const res = await api.post(`/patients/${patientId}/surgery/complete`, payload);
  return res.data.data;
}

/** Ends the pathway and closes the nurse's assignment with it. */
export async function dischargePatient(patientId, payload = {}) {
  const res = await api.post(`/patients/${patientId}/discharge`, payload);
  return res.data.data;
}
