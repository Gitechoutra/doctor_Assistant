/** Where the API lives, resolved once for everything that talks to it.
 *
 *  VITE_API_BASE_URL comes from frontend/.env. When that file is missing the
 *  variable is undefined, and calling a string method on it throws while the
 *  module is still being imported — before React renders anything. That
 *  produces a completely blank page on every route with no visible clue, so
 *  the value is defaulted here instead, and the problem is reported to the
 *  console rather than taken out on the whole app.
 *
 *  The default matches the dev backend (`python app.py` on :5000). A real
 *  deployment must set the variable; the warning is there so an unset one
 *  is noticed in dev rather than shipped.
 */
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
