import api from "./api";
import { downloadPdf, openPdfForPrint } from "./reportService";

/**
 * Today's queue, already numbered by the server.
 *
 * Deliberately not numbered here. The PA reads a position out loud at the
 * desk and the patient counts it down on the doctor's screen, so both clients
 * take the same numbers from one place — see `helpers/queue_helper.number_queue`.
 * `queue_number` is 0 for whoever is with the doctor and 1..n for the rest.
 */
export async function fetchQueue() {
  const res = await api.get("/appointments/queue");
  return res.data.data;
}

/** Booked, not yet arrived. `days` bounds how far ahead to look. */
export async function fetchUpcoming(days = 30) {
  const res = await api.get("/appointments/upcoming", { params: { days } });
  return res.data.data;
}

/** The appointment book. `{ status, date_from, date_to, search }`. */
export async function fetchAppointments(params = {}) {
  const res = await api.get("/appointments", { params });
  return res.data.data;
}

/**
 * Appointments that have left the queue — completed and cancelled — each with
 * the consultation it produced. Paginated: unlike the queue this only ever
 * grows, so it is never fetched whole. Returns { items, meta }.
 */
export async function fetchAppointmentHistory(params = {}) {
  const res = await api.get("/appointments/history", { params });
  return res.data.data;
}

/**
 * Books a patient in.
 *
 * `{ patient_id, walk_in }` for somebody at the desk now — they join today's
 * queue immediately. `{ patient_id, scheduled_at }` for a booking, which
 * joins the queue when `checkInAppointment` is called on the day.
 */
export async function createAppointment(payload) {
  const res = await api.post("/appointments", payload);
  return res.data.data;
}

/** The booked patient has arrived. This is what puts them in the queue. */
export async function checkInAppointment(appointmentId) {
  const res = await api.post(`/appointments/${appointmentId}/check-in`);
  return res.data.data;
}

/** Moves a booking, or corrects its reason and notes. Bookings only — once
 *  the patient has arrived the server refuses, and cancelling is the way. */
export async function updateAppointment(appointmentId, payload) {
  const res = await api.patch(`/appointments/${appointmentId}`, payload);
  return res.data.data;
}

export async function cancelAppointment(appointmentId, reason) {
  const res = await api.post(`/appointments/${appointmentId}/cancel`, { reason });
  return res.data.data;
}

/** Calls the patient in. Doctor only — opens or resumes their consultation. */
export async function startAppointment(appointmentId) {
  const res = await api.post(`/appointments/${appointmentId}/start`);
  return res.data.data;
}

/** The slip the patient takes away — generated once the appointment exists. */
export async function generateAppointmentSlip(appointmentId) {
  const res = await api.post(`/appointments/${appointmentId}/slip`);
  return res.data.data;
}

export function downloadAppointmentSlip(appointmentId, suggestedName) {
  return downloadPdf(`/appointments/${appointmentId}/slip/download`, suggestedName);
}

export function printAppointmentSlip(appointmentId, suggestedName) {
  return openPdfForPrint(`/appointments/${appointmentId}/slip/download`, suggestedName);
}

/** How each status should read on a badge. Mirrors STATUS_LABELS in
 *  `backend/portal/models/appointment.py`; the server sends `status_label`
 *  with every appointment, and this is only the fallback for a row that
 *  somehow arrives without one. */
export const STATUS_LABELS = {
  scheduled: "Scheduled",
  waiting: "Waiting",
  in_progress: "In Consultation",
  completed: "Completed",
  cancelled: "Cancelled",
};
