import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import NurseSidebar from "../components/nurse/NurseSidebar";
import AppShell from "./AppShell";
import NotificationMenu from "../components/NotificationMenu";
import ProfileMenu from "../components/ProfileMenu";
import { useAuth } from "../context/AuthContext";

/**
 * The nursing module's shell. Guards the whole tree twice over: unauthenticated
 * users go to the nurse login, and a signed-in doctor or admin is sent back to
 * their own dashboard rather than shown a module scoped to someone else's
 * assignments.
 */
export default function NurseLayout() {
  const { user, isAuthenticated, refreshUser } = useAuth();

  // Same reason as DashboardLayout: the cached user may predate a profile
  // edit. A failure is ignored because the cached copy is still usable.
  useEffect(() => {
    if (isAuthenticated) refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== "nurse") {
    return <Navigate to="/dashboard" replace />;
  }

  const header = (
    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">Nursing station</p>
        <p className="truncate text-xs text-slate-400">
          Patients assigned to you by the treating doctor
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NotificationMenu />
        <ProfileMenu />
      </div>
    </div>
  );

  return (
    <AppShell sidebar={<NurseSidebar />} header={header}>
      <Outlet />
    </AppShell>
  );
}
