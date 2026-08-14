import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  HiOutlineBell,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClock,
  HiOutlineDocumentChartBar,
  HiOutlineExclamationTriangle,
  HiOutlineHandRaised,
  HiOutlineHeart,
  HiOutlineInformationCircle,
  HiOutlineXMark,
} from "react-icons/hi2";
import useDismissable from "../hooks/useDismissable";
import useEmergencyClaim from "../hooks/useEmergencyClaim";
import { useAuth } from "../context/AuthContext";
import { onDashboardChanged } from "../services/socket";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService";

// How often the badge re-checks in the background. The dashboard socket
// ping (see below) covers most cases promptly; this is just the backstop.
const POLL_INTERVAL_MS = 60_000;

// How long a toast stays on screen before it dismisses itself.
const TOAST_DURATION_MS = 3000;

const CATEGORY_ICONS = {
  appointment: HiOutlineCalendarDays,
  consultation: HiOutlineChatBubbleLeftRight,
  report: HiOutlineDocumentChartBar,
  nursing: HiOutlineHeart,
  shift: HiOutlineClock,
  system: HiOutlineInformationCircle,
};

// A critical nursing alert (nursing_routes._raise_alert) prefixes its title
// with this emoji — the only signal that survives from `ClinicalAlert.severity`
// onto the notification, which otherwise carries no structured severity at
// all. Reused here rather than adding a column: a routine "dose logged" or
// "note added" nursing notification must not get the same urgent treatment,
// so something has to tell them apart.
const CRITICAL_ALERT_PREFIX = "🚨";

function isCriticalAlert(notification) {
  return Boolean(notification?.title?.startsWith(CRITICAL_ALERT_PREFIX));
}

/**
 * An unclaimed emergency case attached to this notification, or null.
 *
 * Set by `notification_routes._present` and only for a doctor, and only while
 * the case is genuinely still unclaimed — so this is also the answer to "may
 * this reader claim it?", and the button below never has to guess.
 */
function claimableCase(notification) {
  return notification?.emergency_case || null;
}

/**
 * Anything that should not quietly scroll past: a critical nursing alert, or
 * an emergency nobody has picked up yet. Both get the red treatment, and a
 * toast carrying either stays on screen until it is dealt with — a Claim
 * button that disappears after three seconds is no better than the walk to
 * the board it replaces.
 */
function isUrgent(notification) {
  return isCriticalAlert(notification) || Boolean(claimableCase(notification));
}

/** The one Claim control, drawn the same in the toast and in the panel. */
function ClaimEmergencyButton({ busy, onClaim }) {
  return (
    <button
      onClick={onClaim}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
    >
      <HiOutlineHandRaised className="h-3.5 w-3.5" />
      {busy ? "Claiming…" : "Claim"}
    </button>
  );
}

/**
 * Where each role's own copy of a shared screen lives.
 *
 * Nursing, pharmacy and the laboratory are separate route trees, each guarded
 * by its layout — a nurse sent to `/dashboard/...` is bounced straight back
 * out. Every role not listed here already lives under `/dashboard`.
 */
const MODULE_HOME = {
  nurse: "/nurse",
  pharmacist: "/pharmacy",
  lab_technician: "/lab",
};

function timeAgo(iso) {
  if (!iso) return "";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Toast({ notification, onDismiss, onClick, onClaim, claiming, claimError }) {
  const urgent = isUrgent(notification);
  const emergencyCase = claimableCase(notification);

  // An urgent one stays until someone actually deals with it — the whole
  // complaint this is fixing is a doctor missing one among routine pings
  // that vanish after three seconds on their own.
  useEffect(() => {
    if (urgent) return undefined;
    const t = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [onDismiss, urgent]);

  const Icon = urgent
    ? HiOutlineExclamationTriangle
    : CATEGORY_ICONS[notification.category] || CATEGORY_ICONS.system;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.95, transition: { duration: 0.18 } }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`pointer-events-auto w-full rounded-2xl border p-4 shadow-2xl ${
        urgent
          ? "border-red-200 bg-red-50 shadow-red-900/10"
          : "border-slate-100 bg-white shadow-slate-900/10"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onClick}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span
            className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
              urgent ? "bg-red-100 text-red-600" : "bg-brand-100 text-brand-600"
            }`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-sm font-semibold ${
                urgent ? "text-red-900" : "text-slate-900"
              }`}
            >
              {notification.title}
            </span>
            {notification.body && (
              <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-slate-500">
                {notification.body}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </button>
      </div>

      {/* The claim, right where the doctor first hears about the emergency —
          nested outside the row's own button rather than inside it, so the
          two actions stay distinguishable to a screen reader as well. */}
      {emergencyCase && (
        <div className="mt-3 flex items-center gap-2 pl-11">
          <ClaimEmergencyButton busy={claiming} onClaim={onClaim} />
          {claimError && <span className="text-xs text-red-600">{claimError}</span>}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Points a stored link at the module the *reader* actually lives in.
 *
 * A notification carries one link for everyone it goes to, but a lab request
 * is reachable at two different URLs: `/lab/requests/7` inside the laboratory
 * module and `/dashboard/lab/7` for the doctor who ordered it. Without this
 * rewrite, a doctor tapping "Lab report ready" would land in the technician's
 * tree and be bounced straight back out by LabLayout's role guard.
 */
export function resolveLink(link, role) {
  if (!link) return link;
  const labRequest = link.match(/^\/lab\/requests\/(\d+)$/);
  if (labRequest && role !== "lab_technician") {
    return `/dashboard/lab/${labRequest[1]}`;
  }
  // The shift schedule is the same screen in all four trees, so a shift notification is
  // stored with one link and pointed at the reader's own module here. Without
  // this a scheduled nurse taps "You have a new shift" and lands back on her
  // dashboard, which is the one place the shift is not.
  if (link === "/dashboard/shifts" && MODULE_HOME[role]) {
    return `${MODULE_HOME[role]}/shifts`;
  }
  return link;
}

export default function NotificationMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const containerRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toasts, setToasts] = useState([]);

  // Tracks unread ids already shown, so only genuinely new arrivals pop a
  // toast — not every notification that already existed before this page
  // loaded.
  const seenIdsRef = useRef(null);

  const close = useCallback(() => setIsOpen(false), []);
  useDismissable(containerRef, isOpen, close);

  const dismissToast = useCallback((toastId) => {
    setToasts((t) => t.filter((x) => x.toastId !== toastId));
  }, []);

  const load = useCallback(async () => {
    try {
      const { items: rows, unread_count: unread } = await fetchNotifications();
      const unreadRows = rows.filter((r) => !r.is_read);

      if (seenIdsRef.current === null) {
        // First load: just note what's already there — no toast backlog.
        seenIdsRef.current = new Set(unreadRows.map((r) => r.id));
      } else {
        const arrivals = unreadRows.filter((r) => !seenIdsRef.current.has(r.id));
        if (arrivals.length) {
          arrivals.forEach((r) => seenIdsRef.current.add(r.id));
          setToasts((t) => [
            ...t,
            ...arrivals.map((n) => ({ toastId: `${n.id}-${Date.now()}`, notification: n })),
          ]);
        }
      }

      setItems(unreadRows);
      setUnreadCount(unread);
      setErrorMsg("");
    } catch {
      // A failed background poll shouldn't nag; only the open panel surfaces it.
      setErrorMsg("Couldn't load notifications.");
    }
  }, []);

  // Keep the badge current even while the panel is closed: a server push
  // when something notification-worthy happens, plus a slow poll backstop.
  useEffect(() => {
    load();
    const pollId = setInterval(load, POLL_INTERVAL_MS);
    const unsubscribe = onDashboardChanged(() => load());
    return () => {
      clearInterval(pollId);
      unsubscribe();
    };
  }, [load]);

  async function handleToggle() {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  }

  async function handleOpenNotification(notification) {
    close();
    // Once opened, a notification is read — it drops out of the unread list
    // immediately rather than lingering with a "read" style.
    setItems((rows) => rows.filter((r) => r.id !== notification.id));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const { unread_count: unread } = await markNotificationRead(notification.id);
      setUnreadCount(unread);
    } catch {
      load(); // roll back to whatever the server actually thinks
    }
    if (notification.link) navigate(resolveLink(notification.link, user?.role));
  }

  // Claiming from a notification is the same act as claiming from the board
  // or the Alerts page — same hook, so the case is assigned server-side and
  // the doctor lands on it identically. Only the cleanup is local: the row
  // and its toast have been acted on, so they go.
  const {
    claim,
    claimingId,
    error: claimError,
  } = useEmergencyClaim({
    onSettled: (caseId, err) => {
      // Refused (somebody else got there first, most likely) — refetch so
      // the now-meaningless Claim button goes away with it.
      if (err) load();
    },
  });

  async function handleClaimEmergency(notification) {
    const emergencyCase = claimableCase(notification);
    if (!emergencyCase) return;
    if (!(await claim(emergencyCase.id))) return;

    setToasts((t) => t.filter((x) => x.notification.id !== notification.id));
    setItems((rows) => rows.filter((r) => r.id !== notification.id));
    setUnreadCount((c) => Math.max(0, c - 1));
    close();
    try {
      const { unread_count: unread } = await markNotificationRead(notification.id);
      setUnreadCount(unread);
    } catch {
      load();
    }
  }

  async function handleMarkAllRead() {
    setItems([]);
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  }

  function handleToastClick(notification) {
    setToasts((t) => t.filter((x) => x.notification.id !== notification.id));
    handleOpenNotification(notification);
  }

  return (
    <>
      {/* Fixed to the viewport rather than the bell, so a toast is visible
          no matter where in the layout this component is mounted. */}
      <div className="pointer-events-none fixed right-4 top-4 z-100 flex w-full max-w-sm flex-col gap-2 sm:right-6 sm:top-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <Toast
              key={t.toastId}
              notification={t.notification}
              onDismiss={() => dismissToast(t.toastId)}
              onClick={() => handleToastClick(t.notification)}
              onClaim={() => handleClaimEmergency(t.notification)}
              claiming={claimingId === t.notification.emergency_case?.id}
              claimError={
                claimError?.caseId === t.notification.emergency_case?.id
                  ? claimError.message
                  : ""
              }
            />
          ))}
        </AnimatePresence>
      </div>

      <div ref={containerRef} className="relative">
        <button
          onClick={handleToggle}
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
          aria-expanded={isOpen}
          className={`relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-slate-50 ${
            isOpen ? "bg-slate-100 text-slate-700" : "text-slate-500"
          }`}
        >
          <HiOutlineBell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          // Below `sm` this anchors to the viewport edges (`fixed inset-x-4`)
          // rather than the bell: the bell isn't the last icon in the header,
          // so a panel wide enough to be readable and anchored to *its own*
          // right edge runs off the left side of a phone screen. From `sm` up
          // there's enough room either way, so it reverts to hanging off the
          // bell like every other dropdown in the app.
          <div className="fixed inset-x-4 top-16 z-50 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-900/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-88 sm:max-w-[calc(100vw-2rem)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                  ))}
                </div>
              ) : errorMsg ? (
                <p className="px-4 py-10 text-center text-sm text-red-600">{errorMsg}</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-400">
                  You're all caught up. New patients in your queue and completed
                  consultations will show up here.
                </p>
              ) : (
                items.map((n) => {
                  const urgent = isUrgent(n);
                  const emergencyCase = claimableCase(n);
                  const Icon = urgent
                    ? HiOutlineExclamationTriangle
                    : CATEGORY_ICONS[n.category] || CATEGORY_ICONS.system;
                  return (
                    <div
                      key={n.id}
                      className={`border-b border-slate-50 ${
                        urgent ? "bg-red-50" : "bg-brand-50/50"
                      }`}
                    >
                      <button
                        onClick={() => handleOpenNotification(n)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                      >
                        <span
                          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                            urgent ? "bg-red-100 text-red-600" : "bg-brand-100 text-brand-600"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span
                              className={`truncate text-sm font-semibold ${
                                urgent ? "text-red-900" : "text-slate-900"
                              }`}
                            >
                              {n.title}
                            </span>
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                urgent ? "bg-red-500" : "bg-brand-500"
                              }`}
                            />
                          </span>
                          {n.body && (
                            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                              {n.body}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {timeAgo(n.created_at)}
                          </span>
                        </span>
                      </button>

                      {/* Claim without leaving the bell: opening the row and
                          walking over to the board was the whole delay. */}
                      {emergencyCase && (
                        <div className="flex flex-wrap items-center gap-2 pb-3 pl-15 pr-4">
                          <ClaimEmergencyButton
                            busy={claimingId === emergencyCase.id}
                            onClaim={() => handleClaimEmergency(n)}
                          />
                          {claimError?.caseId === emergencyCase.id && (
                            <span className="text-xs text-red-600">{claimError.message}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
