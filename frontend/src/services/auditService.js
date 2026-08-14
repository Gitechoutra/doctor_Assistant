import api from "./api";

/** Admin-only: the full trail, newest first. */
export async function fetchAuditLog(params = {}) {
  const res = await api.get("/audit", { params });
  return res.data.data;
}

/** Everything that has happened to one record. Open to admins and doctors. */
export async function fetchEntityHistory(entity, entityId) {
  const res = await api.get(`/audit/entity/${entity}/${entityId}`);
  return res.data.data;
}
