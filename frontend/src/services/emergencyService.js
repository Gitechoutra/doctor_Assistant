import api from "./api";

export async function fetchEmergencyCases(params = {}) {
  // e.g. { status: "resolved" } to look up closed cases instead of the
  // open board.
  const res = await api.get("/emergency", { params });
  return res.data.data;
}

export async function fetchEmergencyCase(caseId) {
  const res = await api.get(`/emergency/${caseId}`);
  return res.data.data;
}

export async function createEmergencyCase(payload) {
  const res = await api.post("/emergency", payload);
  return res.data.data;
}

export async function claimEmergencyCase(caseId) {
  const res = await api.post(`/emergency/${caseId}/claim`);
  return res.data.data;
}

export async function updateEmergencyCase(caseId, payload) {
  const res = await api.patch(`/emergency/${caseId}`, payload);
  return res.data.data;
}

export async function linkEmergencyAppointment(caseId, appointmentId) {
  const res = await api.post(`/emergency/${caseId}/link-appointment`, {
    appointment_id: appointmentId,
  });
  return res.data.data;
}

export async function resolveEmergencyCase(caseId, payload = {}) {
  const res = await api.post(`/emergency/${caseId}/resolve`, payload);
  return res.data.data;
}

export async function reopenEmergencyCase(caseId) {
  const res = await api.post(`/emergency/${caseId}/reopen`);
  return res.data.data;
}

export async function cancelEmergencyCase(caseId) {
  const res = await api.post(`/emergency/${caseId}/cancel`);
  return res.data.data;
}
