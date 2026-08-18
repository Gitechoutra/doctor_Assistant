import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearPortalSession, PORTAL_PATIENT_KEY } from "../services/portalApi";
import {
  fetchMe,
  loginPatient,
  registerPatient,
} from "../services/portalService";

const PortalAuthContext = createContext(null);

/**
 * Reads the cached patient, treating anything unreadable as "signed out".
 *
 * Same defensive shape as `AuthContext.readStoredUser`, and for the same
 * reason: localStorage survives deploys, is editable by hand, and holds
 * whatever an older build wrote. Parsing it without a guard throws inside the
 * provider's first render, and because the provider wraps the portal's whole
 * router that blanks every page on every reload until the key is cleared by
 * hand. The bad value is dropped rather than left in place, so one reload
 * recovers instead of failing identically forever.
 */
function readStoredPatient() {
  const stored = localStorage.getItem(PORTAL_PATIENT_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object" && parsed.id) return parsed;
    console.warn("Ignoring cached patient: unexpected shape.", parsed);
  } catch (err) {
    console.warn("Ignoring cached patient: could not be parsed.", err);
  }
  localStorage.removeItem(PORTAL_PATIENT_KEY);
  return null;
}

/**
 * The signed-in patient.
 *
 * Deliberately a second provider rather than a mode of `AuthContext`. The two
 * sessions are independent all the way down — different tokens, different
 * storage keys, different sign-out — and a single context with a "which kind
 * of user is this?" branch would be one `if` away from rendering a patient the
 * practice's screens.
 */
export function PortalAuthProvider({ children }) {
  const [patient, setPatient] = useState(readStoredPatient);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (patient && typeof patient === "object") {
      localStorage.setItem(PORTAL_PATIENT_KEY, JSON.stringify(patient));
    } else {
      localStorage.removeItem(PORTAL_PATIENT_KEY);
    }
  }, [patient]);

  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    try {
      setPatient(await loginPatient(email, password));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (payload) => {
    setIsLoading(true);
    try {
      setPatient(await registerPatient(payload));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearPortalSession();
    setPatient(null);
  }, []);

  /** Re-reads the patient from the API, so details changed at the desk (or in
   *  another tab) don't linger in a stale cached copy. */
  const refresh = useCallback(async () => {
    const fresh = await fetchMe();
    setPatient(fresh);
    return fresh;
  }, []);

  const value = {
    patient,
    isAuthenticated: Boolean(patient),
    isLoading,
    login,
    register,
    logout,
    refresh,
    updatePatient: setPatient,
  };

  return (
    <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) {
    throw new Error("usePortalAuth must be used within a PortalAuthProvider");
  }
  return ctx;
}
