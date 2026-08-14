import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import AppShell from "./AppShell";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthContext";

export default function DashboardLayout() {
  const { user, refreshUser } = useAuth();

  // The cached user in localStorage is whatever the last login returned, so a
  // session that predates a profile edit (or a new field like avatar_url)
  // would show stale details. One read on mount keeps the topbar honest;
  // a failure is ignored because the cached copy is still usable.
  useEffect(() => {
    refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A nurse belongs in the nursing module — every screen here is scoped to a
  // doctor's or admin's work and would come back empty for them.
  if (user?.role === "nurse") {
    return <Navigate to="/nurse" replace />;
  }
  if (user?.role === "pharmacist") {
    return <Navigate to="/pharmacy" replace />;
  }
  // Same reason: every screen in this tree is a doctor's or admin's, and the
  // API 403s all of them for a lab technician.
  if (user?.role === "lab_technician") {
    return <Navigate to="/lab" replace />;
  }

  return (
    <AppShell sidebar={<Sidebar />} header={<Topbar />}>
      <Outlet />
    </AppShell>
  );
}
