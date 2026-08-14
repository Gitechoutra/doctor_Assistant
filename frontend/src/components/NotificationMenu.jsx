import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineBell,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineDocumentChartBar,
  HiOutlineInformationCircle,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import useDismissable from "../hooks/useDismissable";
import { onDashboardChanged } from "../services/socket";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService";

// How often the badge re-checks in the background. The socket ping covers
// most cases promptly; this is just the backstop for a dropped connection.
const POLL_INTERVAL_MS = 60_000;

const CATEGORY_ICONS = {
  appointment: HiOutlineCalendarDays,
  consultation: HiOutlineChatBubbleLeftRight,
  patient_assignment: HiOutlineUserPlus,
  report: HiOutlineDocumentChartBar,
  system: HiOutlineInformationCircle,
};

function timeAgo(iso) {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The bell.
 *
 * Deliberately plain. The hospital version carried a claim button for
 * unclaimed emergency cases, a severity heuristic that read urgency out of an
 * emoji in the title, and a toast stack — all of it in service of a board this
 * practice does not have. What is left is what a two-person practice actually
 * needs from a notification: the PA is told when a consultation finishes, the
 * doctor is told when somebody joins their queue, and either can click through
 * to it.
 */
export default function NotificationMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useDismissable(ref, () => setOpen(false), open);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications({ limit: 20 });
      setItems(data.items || []);
      setUnread(data.unread_count || 0);
    } catch {
      // A bell that cannot load is not worth an error banner over the page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = onDashboardChanged(load);
    const poll = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [load]);

  async function handleOpen(notification) {
    setOpen(false);
    if (!notification.is_read) {
      try {
        const data = await markNotificationRead(notification.id);
        setUnread(data.unread_count || 0);
        setItems((current) =>
          current.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
      } catch {
        // Navigating matters more than the read flag; it will catch up.
      }
    }
    if (notification.link) navigate(notification.link);
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead();
      setUnread(0);
      setItems((current) => current.map((n) => ({ ...n, is_read: true })));
    } catch {
      load();
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-50"
      >
        <HiOutlineBell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                Nothing to catch up on.
              </p>
            ) : (
              items.map((notification) => {
                const Icon = CATEGORY_ICONS[notification.category] || HiOutlineInformationCircle;
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleOpen(notification)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      notification.is_read ? "" : "bg-brand-50/40"
                    }`}
                  >
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm ${
                          notification.is_read
                            ? "text-slate-600"
                            : "font-semibold text-slate-800"
                        }`}
                      >
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                          {notification.body}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <span
                        aria-hidden
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
