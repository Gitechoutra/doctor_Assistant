import api from "./api";

/** The doctor's picker: who is available, and how much each already carries. */
export async function fetchNurses(departmentId) {
  const res = await api.get("/nursing/nurses", {
    params: departmentId ? { department_id: departmentId } : undefined,
  });
  return res.data.data;
}

export async function createNurse(payload) {
  const res = await api.post("/nursing/nurses", payload);
  return res.data.data;
}

/** Scoped server-side: a nurse gets their own list, a doctor gets theirs. */
export async function fetchAssignments(params = {}) {
  const res = await api.get("/nursing/assignments", { params });
  return res.data.data;
}

export async function fetchAssignment(id) {
  const res = await api.get(`/nursing/assignments/${id}`);
  return res.data.data;
}

export async function createAssignment(payload) {
  const res = await api.post("/nursing/assignments", payload);
  return res.data.data;
}

/** Doctor-only: revise the plan, extend the watch, reassign, or close it. */
export async function updateAssignment(id, payload) {
  const res = await api.patch(`/nursing/assignments/${id}`, payload);
  return res.data.data;
}

export async function addMedicationOrder(assignmentId, payload) {
  const res = await api.post(`/nursing/assignments/${assignmentId}/medications`, payload);
  return res.data.data;
}

export async function updateMedicationOrder(orderId, payload) {
  const res = await api.patch(`/nursing/medications/${orderId}`, payload);
  return res.data.data;
}

export async function recordAdministration(assignmentId, payload) {
  const res = await api.post(
    `/nursing/assignments/${assignmentId}/administrations`,
    payload
  );
  return res.data.data;
}

export async function recordObservation(assignmentId, payload) {
  const res = await api.post(`/nursing/assignments/${assignmentId}/observations`, payload);
  return res.data.data;
}

export async function addNursingNote(assignmentId, payload) {
  const res = await api.post(`/nursing/assignments/${assignmentId}/notes`, payload);
  return res.data.data;
}

export async function raiseAlert(assignmentId, payload) {
  const res = await api.post(`/nursing/assignments/${assignmentId}/alerts`, payload);
  return res.data.data;
}

export async function fetchAlerts(status = "open") {
  const res = await api.get("/nursing/alerts", { params: { status } });
  return res.data.data;
}

export async function acknowledgeAlert(alertId, payload = {}) {
  const res = await api.post(`/nursing/alerts/${alertId}/acknowledge`, payload);
  return res.data.data;
}

export async function fetchTimeline(assignmentId) {
  const res = await api.get(`/nursing/assignments/${assignmentId}/timeline`);
  return res.data.data;
}

export async function fetchNursingSummary() {
  const res = await api.get("/nursing/summary");
  return res.data.data;
}

/** A `datetime-local` input reads as wall-clock time with no zone. The API
 *  stores UTC, so convert here rather than letting the server guess. */
export function localInputToIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** The inverse, for pre-filling a `datetime-local` with "now". */
export function isoToLocalInput(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/** The doctor/nurse conversation about one patient. */
export async function fetchMessages(assignmentId) {
  const res = await api.get(`/nursing/assignments/${assignmentId}/messages`);
  return res.data.data;
}

export async function sendMessage(assignmentId, body) {
  const res = await api.post(`/nursing/assignments/${assignmentId}/messages`, { body });
  return res.data.data;
}

/** Clears the unread badge. Only ever affects the other side's messages. */
export async function markMessagesRead(assignmentId) {
  const res = await api.post(`/nursing/assignments/${assignmentId}/messages/read`);
  return res.data.data;
}

/** Every nursing update across the caller's patients, newest first. */
export async function fetchNursingUpdates(params = {}) {
  const res = await api.get("/nursing/updates", { params });
  return res.data.data;
}

/** Doctor-only: clears the "new updates" badge on one patient's record. */
export async function markAssignmentSeen(assignmentId) {
  const res = await api.post(`/nursing/assignments/${assignmentId}/seen`);
  return res.data.data;
}

/**
 * Ends nursing care for a patient. Open to the assigned nurse and the treating
 * doctor; `cancelled` is doctor-only. Nothing else closes an assignment — the
 * observation window passing does not.
 */
export async function dischargeAssignment(assignmentId, payload = {}) {
  const res = await api.post(`/nursing/assignments/${assignmentId}/discharge`, payload);
  return res.data.data;
}
