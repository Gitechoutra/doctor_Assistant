import api from "./api";

export async function fetchDashboardSummary() {
  const res = await api.get("/dashboard/summary");
  return res.data.data;
}
