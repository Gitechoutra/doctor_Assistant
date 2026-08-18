import portalApi, {
  PORTAL_ACCESS_TOKEN_KEY,
  PORTAL_PATIENT_KEY,
  PORTAL_REFRESH_TOKEN_KEY,
} from "./portalApi";

/**
 * Everything the patient portal asks the server for.
 *
 * Every call here is scoped by the token, not by an id in the URL — there is
 * no `patient_id` parameter anywhere below, because the server takes the
 * patient from the token and there is nothing for a caller to get wrong.
 */

function unwrap(response) {
  return response.data?.data;
}

function storeSession({ access_token: access, refresh_token: refresh, patient }) {
  localStorage.setItem(PORTAL_ACCESS_TOKEN_KEY, access);
  if (refresh) localStorage.setItem(PORTAL_REFRESH_TOKEN_KEY, refresh);
  if (patient) localStorage.setItem(PORTAL_PATIENT_KEY, JSON.stringify(patient));
  return patient;
}

export async function registerPatient(payload) {
  const data = unwrap(await portalApi.post("/portal/register", payload));
  return storeSession(data);
}

export async function loginPatient(email, password) {
  const data = unwrap(await portalApi.post("/portal/login", { email, password }));
  return storeSession(data);
}

export async function fetchMe() {
  return unwrap(await portalApi.get("/portal/me"));
}

export async function updateMe(payload) {
  return unwrap(await portalApi.patch("/portal/me", payload));
}

export async function fetchMyDoctor() {
  return unwrap(await portalApi.get("/portal/doctor"));
}

/** Appointments still to come: booked, arrived, and with the doctor now. */
export async function fetchActiveAppointments() {
  return unwrap(await portalApi.get("/portal/appointments")) || [];
}

/** Visits that are over — completed, and ones that were called off. */
export async function fetchAppointmentHistory(params = {}) {
  return unwrap(await portalApi.get("/portal/appointments/history", { params })) || {
    items: [],
    meta: {},
  };
}

export async function bookAppointment({ scheduled_at, reason }) {
  return unwrap(await portalApi.post("/portal/appointments", { scheduled_at, reason }));
}

export async function cancelAppointment(appointmentId, reason) {
  return unwrap(
    await portalApi.post(`/portal/appointments/${appointmentId}/cancel`, { reason })
  );
}
