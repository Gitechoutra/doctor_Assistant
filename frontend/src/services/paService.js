import api from "./api";

/**
 * The practice's assistants — the desk's accounts, created by the doctor.
 *
 * The near-mirror of `doctorService.createDoctor`, with one difference that
 * matters: an assistant's first password is never returned to the caller. It
 * goes to the assistant's inbox and nowhere else.
 */

/** Every PA this practice has. Doctor only — the API 403s the PA. */
export async function fetchPAs() {
  const res = await api.get("/pas");
  return res.data.data;
}

/**
 * The doctor setting up an assistant's account. Doctor only.
 *
 * `{ name, email }`, and nothing else — there is no password to send. The
 * server generates the first one, hashes it, and emails it to the assistant
 * with a single-use link to replace it; no password is ever returned here, so
 * nothing this client holds could leak one.
 *
 * Rejects rather than half-succeeds. If the invitation cannot be sent the
 * account is rolled back and this throws, because an assistant who was never
 * told their password has no way in.
 */
export async function createPA(payload) {
  const res = await api.post("/pas", payload);
  return res.data.data; // the PA's fields — name, email, username, no secret
}

/**
 * Permanently removes an assistant's account and credentials. Doctor only.
 * There is no undo — the caller is expected to confirm first.
 */
export async function deletePA(id) {
  const res = await api.delete(`/pas/${id}`);
  return res.data.data;
}
