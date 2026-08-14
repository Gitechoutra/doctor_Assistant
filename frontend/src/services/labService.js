import api from "./api";

/**
 * Laboratory test requests.
 *
 * Reads are scoped by the server, not here: a doctor gets the tests they
 * ordered, a technician gets the ones assigned to them plus the unclaimed
 * pool, an admin gets everything. The client never filters for privacy.
 *
 * Every message endpoint is nested under a request on purpose — there is no
 * call in this file that fetches or posts a message without one, which is
 * what keeps the discussion tied to a single patient's single test.
 */

export async function fetchLabRequests(params = {}) {
  const res = await api.get("/lab/requests", { params });
  return res.data.data;
}

export async function fetchLabSummary() {
  const res = await api.get("/lab/summary");
  return res.data.data;
}

/** Suggested tests, assignable technicians and departments. */
export async function fetchLabOptions() {
  const res = await api.get("/lab/options");
  return res.data.data;
}

/** One request, its result and its full history. The payload carries
 *  `can_discuss`, `can_process` and `can_verify` for this caller. */
export async function fetchLabRequest(id) {
  const res = await api.get(`/lab/requests/${id}`);
  return res.data.data;
}

/** Doctor (or admin) orders a test. */
export async function createLabRequest(payload) {
  const res = await api.post("/lab/requests", payload);
  return res.data.data;
}

/** Doctor (or admin) edits the order or reassigns the technician. */
export async function updateLabRequest(id, payload) {
  const res = await api.patch(`/lab/requests/${id}`, payload);
  return res.data.data;
}

/** Technician: sample collected / processing / completed.
 *  Doctor: verified / cancelled. The server enforces the split. */
export async function setLabStatus(id, status) {
  const res = await api.patch(`/lab/requests/${id}/status`, { status });
  return res.data.data;
}

/** Technician files the result. Marks the test completed and notifies the
 *  requesting doctor in the same call. */
export async function uploadLabReport(id, file, resultSummary) {
  const form = new FormData();
  form.append("report", file);
  if (resultSummary) form.append("result_summary", resultSummary);
  const res = await api.post(`/lab/requests/${id}/report`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}

/** Streams the stored report back as a download, preserving its file type. */
export async function downloadLabReport(id, filename) {
  const res = await api.get(`/lab/requests/${id}/report`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "lab_report";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The sample is unusable. Puts the request back to Ordered with a reason. */
export async function requestRecollection(id, reason) {
  const res = await api.post(`/lab/requests/${id}/recollect`, { reason });
  return res.data.data;
}

/** The discussion for one request — messages and status entries, in order. */
export async function fetchLabMessages(id) {
  const res = await api.get(`/lab/requests/${id}/messages`);
  return res.data.data;
}

/** Only the requesting doctor and the assigned technician may post. */
export async function postLabMessage(id, body) {
  const res = await api.post(`/lab/requests/${id}/messages`, { body });
  return res.data.data;
}
