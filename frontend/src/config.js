
const FALLBACK = "http://127.0.0.1:5000/api";

const configured = import.meta.env.VITE_API_BASE_URL;

if (!configured) {
  console.warn(
    `VITE_API_BASE_URL is not set — falling back to ${FALLBACK}. ` +
      "Create frontend/.env with VITE_API_BASE_URL=<your api url> " +
      "and restart the dev server."
  );
}

/** Base for API calls, e.g. http://127.0.0.1:5000/api */
export const API_BASE_URL = (configured || FALLBACK).replace(/\/+$/, "");

/** Same host without the /api suffix — for socket.io and for turning the
 *  server-rooted asset paths the API returns into absolute URLs. */
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");
