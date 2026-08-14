import { createContext, useContext, useEffect, useState } from "react";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY } from "../services/api";
import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from "../services/authService";

const AuthContext = createContext(null);

/** The two roles this application has. Every branch on `user.role` in the UI
 *  compares against one of these rather than a bare string, so a rename is a
 *  single edit here and a compile error everywhere it was missed. */
export const ROLE_PA = "pa";
export const ROLE_DOCTOR = "doctor";

/** Reads the cached user, treating anything unreadable as "signed out".
 *
 *  localStorage is external input: it survives deploys, is editable by hand,
 *  and holds whatever an older build of this app wrote. Parsing it without a
 *  guard threw inside this provider's first render — and because the provider
 *  wraps the whole router, that blanked every page on every reload until the
 *  key was cleared by hand.
 *
 *  The bad value is dropped rather than left in place, so one reload recovers
 *  instead of failing identically forever. A cached user missing `id` or
 *  `role` is discarded too: the sidebar and the route guards branch on `role`,
 *  and a half-shaped object would fail further in, where the cause is less
 *  obvious. So is one whose role is neither of the two above — that is a
 *  session from the hospital build of this app (a nurse, a pharmacist, an
 *  admin), and honouring it would put somebody in a UI with no home to land on.
 */
function readStoredUser() {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object" && parsed.id && parsed.role) {
      if (parsed.role === ROLE_PA || parsed.role === ROLE_DOCTOR) {
        return parsed;
      }
      console.warn("Ignoring cached user: unknown role.", parsed.role);
    } else {
      console.warn("Ignoring cached user: unexpected shape.", parsed);
    }
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
      const {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: loggedInUser,
      } = await loginRequest(identifier, password);
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      setUser(loggedInUser);
      return loggedInUser;
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    await logoutRequest();
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
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
    isPA: user?.role === ROLE_PA,
    isDoctor: user?.role === ROLE_DOCTOR,
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
