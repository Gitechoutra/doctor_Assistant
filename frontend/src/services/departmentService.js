import api from "./api";

export async function fetchDepartments() {
  const res = await api.get("/departments");
  return res.data.data;
}

export async function fetchDepartment(id) {
  const res = await api.get(`/departments/${id}`);
  return res.data.data;
}

export async function createDepartment(payload) {
  const res = await api.post("/departments", payload);
  return res.data.data;
}
