import api from "./api";

/**
 * The practice's assistants — the desk's accounts, created by the doctor.
 *
 * The mirror of `doctorService.createDoctor`, and deliberately the same shape:
 * one POST that makes the account and hands back its credentials once.
 */

/** Every PA this practice has. Doctor only — the API 403s the PA. */
export async function fetchPAs() {
  const res = await api.get("/pas");
  return res.data.data;
}

/**
 * The doctor setting up an assistant's account. Doctor only.
 *
 * `password` is optional: leave it out and the server generates one. Either
 * way the response carries a `credentials` object holding the username, email
 * and the raw password **once** — it is not stored anywhere and no route reads
 * it back, so whatever the doctor does not hand over is gone. The PA can sign
 * in with it immediately.
 */
export async function createPA(payload) {
  const res = await api.post("/pas", payload);
  return res.data.data; // the PA's fields + { credentials }
}

/**
 * Permanently removes an assistant's account and credentials. Doctor only.
 * There is no undo — the caller is expected to confirm first.
 */
export async function deletePA(id) {
  const res = await api.delete(`/pas/${id}`);
  return res.data.data;
}
