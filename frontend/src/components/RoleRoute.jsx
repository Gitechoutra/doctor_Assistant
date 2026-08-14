import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Blocks a branch of the router for the given roles, so a hidden nav item
 * can't be reached by typing its URL or using a stale bookmark. Sends them
 * back to the dashboard rather than showing a page they shouldn't have.
 */
export default function RoleRoute({ deny = [] }) {
  const { user } = useAuth();
  return deny.includes(user?.role) ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
