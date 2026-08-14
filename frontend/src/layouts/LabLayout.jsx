import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import AppShell from "./AppShell";
import NotificationMenu from "../components/NotificationMenu";
import ProfileMenu from "../components/ProfileMenu";
import LabSidebar from "../components/lab/LabSidebar";
import { useAuth } from "../context/AuthContext";

/**
 * The laboratory module's shell.
 *
 * Guarded twice, exactly like the nursing and pharmacy trees: an
 * unauthenticated visitor goes to the single login, and a signed-in doctor or
 * admin is sent back to their own dashboard rather than shown a worklist
 * scoped to somebody else. The API enforces the same boundary independently,
 * so a bookmark that gets past this still comes back empty-handed.
 */
export default function LabLayout() {
  const { user, isAuthenticated, refreshUser } = useAuth();

  // Same reason as the other layouts: the cached user may predate a profile
  // edit. A failure is ignored because the cached copy is still usable.
  useEffect(() => {
    if (isAuthenticated) refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "lab_technician") return <Navigate to="/dashboard" replace />;

  const header = (
    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">Laboratory</p>
        <p className="truncate text-xs text-slate-400">
          Tests assigned to you by the treating doctors
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NotificationMenu />
        <ProfileMenu />
      </div>
    </div>
  );

  return (
    <AppShell sidebar={<LabSidebar />} header={header}>
      <Outlet />
    </AppShell>
  );
}
