import axios from "axios";
import { API_BASE_URL } from "../config";

/**
 * The patient portal's HTTP client.
 *
 * A second axios instance rather than a flag on the first one, for the same
 * reason the server keeps two identity spaces (see
 * `backend/portal/helpers/portal_auth.py`): the two must not be able to reach
 * for each other's credentials.
 *
 * `services/api.js` attaches whatever is in `mediassist_access_token` to every
 * request it makes. If the portal wrote its token there, a doctor and a
 * patient signing in on the same machine — a real thing at a practice, on the
 * waiting-room tablet or the doctor's own laptop — would overwrite each other,
 * and whichever signed in last would silently send their token to the other's
 * screens. The server would refuse it, correctly, but the user would see a
 * logged-in interface failing every request with no idea why.
 *
 * So: separate keys, separate instance, separate sign-out. Both sessions can
 * exist side by side and neither can be mistaken for the other.
 */
export const PORTAL_ACCESS_TOKEN_KEY = "mediassist_portal_access_token";
export const PORTAL_REFRESH_TOKEN_KEY = "mediassist_portal_refresh_token";
export const PORTAL_PATIENT_KEY = "mediassist_portal_patient";

const portalApi = axios.create({ baseURL: API_BASE_URL });

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(PORTAL_ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function clearPortalSession() {
  localStorage.removeItem(PORTAL_ACCESS_TOKEN_KEY);
  localStorage.removeItem(PORTAL_REFRESH_TOKEN_KEY);
  localStorage.removeItem(PORTAL_PATIENT_KEY);
}

function signOut() {
  clearPortalSession();
  // Only ever to the portal's own sign-in. Sending a patient to /login would
  // put them on the practice's staff screen, which they can never sign in to.
  if (!window.location.pathname.startsWith("/portal/login")) {
    window.location.href = "/portal/login";
  }
}

// Shared across concurrent 401s so a page firing several requests at once
// refreshes once rather than racing and invalidating its own new token.
let refreshing = null;

function refreshAccessToken() {
  if (refreshing) return refreshing;
  const refreshToken = localStorage.getItem(PORTAL_REFRESH_TOKEN_KEY);
  if (!refreshToken) return Promise.reject(new Error("no refresh token"));

  // A bare axios call, not `portalApi`: the instance's request interceptor
  // would attach the expired access token, and its response interceptor would
  // recurse straight back into here.
  refreshing = axios
    .post(`${API_BASE_URL}/portal/refresh`, null, {
      headers: { Authorization: `Bearer ${refreshToken}` },
    })
    .then((res) => {
      const token = res.data?.data?.access_token;
      if (!token) throw new Error("refresh returned no token");
      localStorage.setItem(PORTAL_ACCESS_TOKEN_KEY, token);
      return token;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

portalApi.interceptors.response.use(
  (response) => response,
  async (err) => {
    const original = err.config;
    const isAuthCall =
      original?.url?.includes("/portal/login") ||
      original?.url?.includes("/portal/register") ||
      original?.url?.includes("/portal/refresh");

    if (err.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return portalApi(original);
      } catch {
        signOut();
        return Promise.reject(err);
      }
    }

    if (err.response?.status === 401 && !isAuthCall) {
      signOut();
    }
    return Promise.reject(err);
  }
);

export default portalApi;
