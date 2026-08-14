import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import AppShell from "./AppShell";
import NotificationMenu from "../components/NotificationMenu";
import ProfileMenu from "../components/ProfileMenu";
import PharmacySidebar from "../components/pharmacy/PharmacySidebar";
import { useAuth } from "../context/AuthContext";

/**
 * The pharmacy module's shell. Guarded twice: unauthenticated visitors go to
 * the single login, and anyone who is not a pharmacist is sent back to their
 * own dashboard rather than shown a counter scoped to someone else's branch.
 */
export default function PharmacyLayout() {
  const { user, isAuthenticated, refreshUser } = useAuth();

  useEffect(() => {
    if (isAuthenticated) refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "pharmacist") return <Navigate to="/dashboard" replace />;

  const header = (
    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">Pharmacy counter</p>
        <p className="truncate text-xs text-slate-400">
          {user?.branch ? `Stock for ${user.branch}` : "No branch assigned"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NotificationMenu />
        <ProfileMenu />
      </div>
    </div>
  );

  return (
    <AppShell sidebar={<PharmacySidebar />} header={header}>
      <Outlet />
    </AppShell>
  );
}
