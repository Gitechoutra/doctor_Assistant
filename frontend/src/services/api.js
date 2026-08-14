import axios from "axios";
import { API_BASE_URL, API_ORIGIN } from "../config";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// The API hands back server-rooted paths like "/api/auth/avatar/<file>".
// Those need the API host in front of them to be usable in an <img src>,
// since the Vite dev server is on a different origin.

export function assetUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("yasodha_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function signOut() {
  localStorage.removeItem("yasodha_access_token");
  localStorage.removeItem("yasodha_refresh_token");
  localStorage.removeItem("yasodha_user");
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

// Shared across concurrent 401s so a page firing several requests at once
// refreshes once rather than racing and invalidating its own new token.
let refreshing = null;

function refreshAccessToken() {
  if (refreshing) return refreshing;
  const refreshToken = localStorage.getItem("yasodha_refresh_token");
  if (!refreshToken) return Promise.reject(new Error("no refresh token"));

  // A bare axios call, not `api`: the instance's request interceptor would
  // attach the expired access token, and its response interceptor would
  // recurse straight back into here.
  refreshing = axios
    .post(`${API_BASE_URL}/auth/refresh`, null, {
      headers: { Authorization: `Bearer ${refreshToken}` },
    })
    .then((res) => {
      const token = res.data?.data?.access_token;
      if (!token) throw new Error("refresh returned no token");
      localStorage.setItem("yasodha_access_token", token);
      return token;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

api.interceptors.response.use(
  (response) => response,
  async (err) => {
    const original = err.config;
    const isAuthCall = original?.url?.includes("/auth/login") ||
      original?.url?.includes("/auth/refresh");

    // An expired access token is renewed and the request retried once, rather
    // than throwing the user out. Access tokens last hours, so without this a
    // doctor mid-consultation was dropped at the login screen and lost the
    // page they were on. `_retried` stops a genuinely rejected token looping.
    if (err.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch {
        signOut();
        return Promise.reject(err);
      }
    }

    if (err.response?.status === 401) {
      signOut();
    }
    return Promise.reject(err);
  }
);

export default api;
