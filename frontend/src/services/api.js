import axios from "axios";
import { API_BASE_URL, API_ORIGIN } from "../config";

// One place for the localStorage keys, exported so AuthContext writes the
// same names this module reads. They used to be spelled out as string
// literals in both files, which is how a rename breaks sign-in in a way that
// only shows up as "logged out again on every reload".
export const ACCESS_TOKEN_KEY = "mediassist_access_token";
export const REFRESH_TOKEN_KEY = "mediassist_refresh_token";
export const USER_KEY = "mediassist_user";

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
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function signOut() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

// Shared across concurrent 401s so a page firing several requests at once
// refreshes once rather than racing and invalidating its own new token.
let refreshing = null;

function refreshAccessToken() {
  if (refreshing) return refreshing;
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
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
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
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
