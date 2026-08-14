import api from "./api";

/**
 * The staff shift schedule.
 *
 * Only the reads are available to every role, and the server narrows them to
 * the caller's own shifts unless they are an admin — the client never has to
 * filter for privacy, and could not be trusted to anyway. Every write below
 * 403s for anyone but an admin.
 */

/** The shift schedule for a date range. Admin gets the whole hospital's and may filter
 *  by staff member, role or department; every other role gets their own
 *  shifts whatever they ask for. The response carries `can_manage`. */
export async function fetchShifts(params = {}) {
  const res = await api.get("/shifts", { params });
  return res.data.data;
}

/** The caller's own shifts, without needing to know their own user id. */
export async function fetchMyShifts(params = {}) {
  const res = await api.get("/shifts/mine", { params });
  return res.data.data;
}

/** Admin only. Assignable staff, slots and their default hours, departments
 *  and branches — everything the shift schedule form needs. */
export async function fetchShiftOptions() {
  const res = await api.get("/shifts/options");
  return res.data.data;
}

/**
 * Admin only. Adds one shift per day between `from_date` and `to_date`
 * inclusive — pass the same date for both to add a single one. `user_id` may
 * be omitted to leave the slots unfilled; when it is given, that staff member
 * is notified and nobody else is.
 *
 * Resolves to `{ items, count }` rather than a single shift, since one call
 * can create a run of them.
 */
export async function createShift(payload) {
  const res = await api.post("/shifts", payload);
  return res.data.data;
}

/** Admin only. Edits, reassigns, or restores a cancelled shift. Every field
 *  is optional; anything omitted is left as it was. */
export async function updateShift(id, payload) {
  const res = await api.patch(`/shifts/${id}`, payload);
  return res.data.data;
}

/** Admin only. Keeps the row so the shift schedule retains its history — the reversible
 *  alternative to deleting, and what the UI offers first. */
export async function cancelShift(id) {
  const res = await api.post(`/shifts/${id}/cancel`);
  return res.data.data;
}

/** Admin only. Permanent; for a row that should never have existed. */
export async function deleteShift(id) {
  const res = await api.delete(`/shifts/${id}`);
  return res.data;
}
