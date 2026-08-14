import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Restricts a branch of the router to one role, so a hidden nav entry can't
 * be reached by typing its URL or using a stale bookmark. Sends anyone else
 * back to their own dashboard rather than showing a page that isn't theirs.
 *
 * `allow` rather than the `deny` list this replaces. With eight roles, "deny"
 * was the shorter list to write; with two, an allowlist says the same thing
 * and keeps saying it correctly if a third is ever added — a new role gets
 * nothing until somebody decides it should.
 *
 * This is a convenience, not the control. Every route it guards is gated
 * again on the API, which is what actually holds: the server returns 403 for
 * these regardless of what the browser lets somebody navigate to.
 */
export default function RoleRoute({ allow = [] }) {
  const { user } = useAuth();
  return allow.includes(user?.role) ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
