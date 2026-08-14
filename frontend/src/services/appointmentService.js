import api from "./api";
import { downloadPdf, openPdfForPrint } from "./reportService";

export async function fetchAppointments(params = {}) {
  // e.g. { filter: "today" } for the dashboard's pending-and-ongoing queue.
  const res = await api.get("/appointments", { params });
  return res.data.data;
}

// Closed OPs — completed and cancelled — with the consultation each one
// produced. Paginated: unlike the queue this only grows, so it is never
// fetched whole. Returns { items, meta }.
export async function fetchAppointmentHistory(params = {}) {
  const res = await api.get("/appointments/history", { params });
  return res.data.data;
}

export async function createAppointment(payload) {
  const res = await api.post("/appointments", payload);
  return res.data.data;
}

export async function startAppointment(appointmentId) {
  const res = await api.post(`/appointments/${appointmentId}/start`);
  return res.data.data;
}

// The OP registration slip — generated once the OP exists, so this always
// follows a successful createAppointment/createPatient call.
export async function generateOpDocument(appointmentId) {
  const res = await api.post(`/appointments/${appointmentId}/op-document`);
  return res.data.data;
}

export function downloadOpDocument(appointmentId, suggestedName) {
  return downloadPdf(`/appointments/${appointmentId}/op-document/download`, suggestedName);
}

export function printOpDocument(appointmentId, suggestedName) {
  return openPdfForPrint(`/appointments/${appointmentId}/op-document/download`, suggestedName);
}
