import api from "./api";

/** Still a list, and still plural — a practice that takes on a second doctor
 *  should not need every caller rewritten. */
export async function fetchDoctors() {
  const res = await api.get("/doctors");
  return res.data.data;
}

/**
 * A doctor setting up another doctor's account. Doctor only — the API 403s the
 * PA. The practice's *first* doctor is the seeded account and never comes
 * through here; this is for a practice taking on a second one.
 *
 * `password` is optional: leave it out and the server generates one. Either
 * way the response carries a `credentials` object holding the username, email
 * and the raw password **once** — it is not stored anywhere and no route reads
 * it back, so whatever is not handed over is gone. The new doctor can sign in
 * with it immediately.
 */
export async function createDoctor(payload) {
  const res = await api.post("/doctors", payload);
  return res.data.data; // doctor fields + { credentials }
}
