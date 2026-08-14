import api from "./api";

/**
 * The practice's doctor — the one every workflow resolves to.
 *
 * Resolves to `null` rather than throwing when no doctor has been set up: that
 * is a state to render as a prompt, not as a broken request.
 */
export async function fetchPracticeDoctor() {
  const res = await api.get("/doctors/practice");
  return res.data.data;
}

/** The doctor editing their own practice details — what is printed at the top
 *  of every prescription and report. Doctor only. */
export async function updatePracticeDoctor(payload) {
  const res = await api.patch("/doctors/practice", payload);
  return res.data.data;
}

/** Still a list, and still plural — a practice that takes on a second doctor
 *  should not need every caller rewritten. */
export async function fetchDoctors() {
  const res = await api.get("/doctors");
  return res.data.data;
}
