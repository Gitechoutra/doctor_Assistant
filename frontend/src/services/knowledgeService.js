import api from "./api";

// The knowledge base of doctor-approved cases. Read-only on purpose: a
// precedent is only ever created by a doctor signing off a real prescription,
// so there is no endpoint to add or edit one by hand.

export async function fetchPrecedents(params = {}) {
  // Accepts { status: active|retired|all } and { search }.
  const res = await api.get("/knowledge", { params });
  return res.data.data;
}

export async function fetchKnowledgeStats() {
  const res = await api.get("/knowledge/stats");
  return res.data.data;
}
