import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import AppShell from "./AppShell";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthContext";

/**
 * The one shell both roles work in.
 *
 * There used to be four of these — a nursing layout, a pharmacy layout, a lab
 * layout and this one — each with its own sidebar and its own redirect out of
 * the others. A practice has one workspace, and which of the two people is
 * looking at it changes the sidebar (see Sidebar.jsx) and what each page
 * offers, not which application they are in.
 */
export default function DashboardLayout() {
  const { refreshUser } = useAuth();

  // The cached user in localStorage is whatever the last login returned, so a
  // session that predates a profile edit would show stale details. One read on
  // mount keeps the topbar honest; a failure is ignored because the cached
  // copy is still usable.
  useEffect(() => {
    refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell sidebar={<Sidebar />} header={<Topbar />}>
      <Outlet />
    </AppShell>
  );
}
