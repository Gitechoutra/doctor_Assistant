import api from "./api";

/** Admin only. Every call here 403s for any other role. */
export async function fetchStaff(params = {}) {
  const res = await api.get("/staff", { params });
  return res.data.data;
}

/** Roles, departments, branches and per-role designation suggestions —
 *  everything the dynamic form needs to render itself. */
export async function fetchStaffOptions() {
  const res = await api.get("/staff/options");
  return res.data.data;
}

export async function fetchStaffMember(id) {
  const res = await api.get(`/staff/${id}`);
  return res.data.data;
}

/** The server derives the username and the first password — neither is in
 *  `payload`. The response carries `credentials` (username, whether the email
 *  went, and the sign-in details themselves *only* if it did not) alongside
 *  the usual staff record, plus a `message` written for the administrator. */
export async function createStaff(payload) {
  const res = await api.post("/staff", payload);
  return { ...res.data.data, message: res.data.message };
}

/** Issues a fresh password and sign-in link and emails them again — for the
 *  staff member who never got the first one, or locked themselves out.
 *  Whatever was sent before stops working. */
export async function resendStaffCredentials(id) {
  const res = await api.post(`/staff/${id}/credentials`);
  return { ...res.data.data, message: res.data.message };
}

export async function updateStaff(id, payload) {
  const res = await api.patch(`/staff/${id}`, payload);
  return res.data.data;
}

/** Enable or disable. The reversible alternative to deletion — login already
 *  refuses an inactive account. */
export async function setStaffStatus(id, isActive) {
  const res = await api.post(`/staff/${id}/status`, { is_active: isActive });
  return res.data.data;
}

/** Permanent. The server refuses when the account has clinical history. */
export async function deleteStaff(id) {
  const res = await api.delete(`/staff/${id}`);
  return res.data;
}
