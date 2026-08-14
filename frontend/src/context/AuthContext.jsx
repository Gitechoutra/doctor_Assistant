import { createContext, useContext, useEffect, useState } from "react";
import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from "../services/authService";

const AuthContext = createContext(null);

const USER_KEY = "yasodha_user";

/** Reads the cached user, treating anything unreadable as "signed out".
 *
 *  localStorage is external input: it survives deploys, is editable by hand,
 *  and holds whatever an older build of this app wrote. Parsing it without a
 *  guard threw inside this provider's first render — and because the provider
 *  wraps the whole router, that blanked every page, including the public
 *  landing page, on every reload until the key was cleared by hand.
 *
 *  The bad value is dropped rather than left in place, so one reload recovers
 *  instead of failing identically forever. A cached user missing `id` or
 *  `role` is discarded too: RoleRoute and the sidebar branch on `role`, and a
 *  half-shaped object would fail further in, where the cause is less obvious.
 */
function readStoredUser() {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object" && parsed.id && parsed.role) {
      return parsed;
    }
    console.warn("Ignoring cached user: unexpected shape.", parsed);
  } catch (err) {
    console.warn("Ignoring cached user: could not be parsed.", err);
  }
  localStorage.removeItem(USER_KEY);
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // JSON.stringify(undefined) returns undefined, which setItem coerces to
    // the string "undefined" -- itself unparseable, which is one way the key
    // gets into the state readStoredUser has to recover from. Writing only a
    // real object keeps that from being created in the first place.
    if (user && typeof user === "object") {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, [user]);

  /** `identifier` is a username or an email address — one field on the form,
   *  and the server tells them apart. */
  async function login(identifier, password) {
    setIsLoading(true);
    try {
      const { access_token, refresh_token, user: loggedInUser } = await loginRequest(
        identifier,
        password
      );
      localStorage.setItem("yasodha_access_token", access_token);
      localStorage.setItem("yasodha_refresh_token", refresh_token);
      setUser(loggedInUser);
      return loggedInUser;
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    await logoutRequest();
    localStorage.removeItem("yasodha_access_token");
    localStorage.removeItem("yasodha_refresh_token");
    setUser(null);
  }

  /** Replaces the cached user after a profile/avatar edit, so the topbar and
   *  every other consumer re-render without a page reload. */
  function updateUser(updatedUser) {
    setUser(updatedUser);
  }

  /** Re-reads the user from the API — used on mount so a profile edited in
   *  another tab (or a stale localStorage copy) doesn't linger. */
  async function refreshUser() {
    const fresh = await fetchCurrentUser();
    setUser(fresh);
    return fresh;
  }

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    logout,
    updateUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
