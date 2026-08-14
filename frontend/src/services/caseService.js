import api from "./api";

// A case is a patient's course of treatment — one or more consultation
// sessions. Sessions themselves are created and ended through
// consultationService; everything here is about the case around them.

export async function fetchCases(params = {}) {
  // Accepts { status: open|closed|all }, { patient_id }, { search }.
  const res = await api.get("/cases", { params });
  return res.data.data;
}

export async function fetchCase(caseId) {
  const res = await api.get(`/cases/${caseId}`);
  return res.data.data;
}

// Ends the course of treatment: generates the consolidated summary and the
// final merged prescription. Every session keeps its own record untouched.
export async function closeCase(caseId) {
  const res = await api.post(`/cases/${caseId}/close`);
  return res.data.data;
}

// Puts a closed case back in treatment. The consolidated record is cleared
// server-side, since it described a course that is no longer finished.
export async function reopenCase(caseId) {
  const res = await api.post(`/cases/${caseId}/reopen`);
  return res.data.data;
}

// Sends the whole edited list; the server replaces the final prescription.
export async function saveFinalPrescriptions(caseId, prescriptions) {
  const res = await api.put(`/cases/${caseId}/prescriptions`, { prescriptions });
  return res.data.data;
}

export async function verifyFinalPrescription(caseId) {
  const res = await api.post(`/cases/${caseId}/prescriptions/verify`);
  return res.data.data;
}

export async function unverifyFinalPrescription(caseId) {
  const res = await api.delete(`/cases/${caseId}/prescriptions/verify`);
  return res.data.data;
}
