import api from "./api";

export async function fetchConsultations(params = {}) {
  // Defaults to completed consultations server-side. Accepts { search },
  // { period: today|week|month|year|all } and { status }.
  const res = await api.get("/consultations", { params });
  return res.data.data;
}

export async function fetchConsultation(id) {
  const res = await api.get(`/consultations/${id}`);
  return res.data.data;
}

/**
 * Starts a consultation session for a patient.
 *
 * This is also how the next session of an ongoing case begins — the server
 * joins the patient's open case, so the previous session's transcript,
 * summary and prescription stay exactly as they were. Returns the new
 * consultation, which has its own id and its own consultation room.
 */
export async function startConsultation(patientId) {
  const res = await api.post("/consultations", { patient_id: patientId });
  return res.data.data;
}

export async function transcribeTurn(consultationId, speaker, audioBlob) {
  const formData = new FormData();
  formData.append("speaker", speaker);
  formData.append("audio", audioBlob, "turn.webm");

  const res = await api.post(`/consultations/${consultationId}/transcribe`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}

export async function endConsultation(consultationId) {
  const res = await api.post(`/consultations/${consultationId}/end`);
  return res.data.data;
}

/**
 * Reopens a just-ended consultation so the same conversation can carry on.
 *
 * For when the patient is still in the room and remembers one more thing.
 * The extra recording is appended to this same transcript, and the summary
 * and prescription are regenerated over all of it when the doctor ends again
 * — it is not a new session. Only allowed on the day of the consultation;
 * a visit on another day is a new session via startConsultation.
 */
export async function continueConsultation(consultationId) {
  const res = await api.post(`/consultations/${consultationId}/continue`);
  return res.data.data;
}

// Sends the whole edited list; the server replaces the prescription with it.
export async function savePrescriptions(consultationId, prescriptions) {
  const res = await api.put(`/consultations/${consultationId}/prescriptions`, { prescriptions });
  return res.data.data; // updated consultation
}

export async function verifyPrescription(consultationId) {
  const res = await api.post(`/consultations/${consultationId}/prescriptions/verify`);
  return res.data.data;
}

export async function unverifyPrescription(consultationId) {
  const res = await api.delete(`/consultations/${consultationId}/prescriptions/verify`);
  return res.data.data;
}
