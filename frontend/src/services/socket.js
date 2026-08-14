import { io } from "socket.io-client";
import { API_ORIGIN as SOCKET_URL } from "../config";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: true, transports: ["websocket", "polling"] });
  }
  return socket;
}

export function joinConsultationRoom(consultationId) {
  getSocket().emit("join_consultation", { consultation_id: consultationId });
}

/**
 * Subscribes to the server's "your dashboard counts may be stale" ping.
 * Returns an unsubscribe function for the caller's cleanup.
 */
export function onDashboardChanged(handler) {
  const s = getSocket();
  s.on("dashboard_changed", handler);
  return () => s.off("dashboard_changed", handler);
}

/**
 * Subscribes to nursing activity — a dose logged, vitals taken, a note or an
 * alert. Kept separate from the dashboard ping because these fire far more
 * often, and only the nursing screens care.
 *
 * The handler receives `{ reason, assignment_id }`, so a detail page can
 * ignore changes to a patient it isn't showing.
 */
export function onNursingChanged(handler) {
  const s = getSocket();
  s.on("nursing_changed", handler);
  return () => s.off("nursing_changed", handler);
}

/**
 * Joins the room for one patient's care thread, so messages arrive without
 * waiting for a poll. Returns an unsubscribe that also leaves the room —
 * without it a doctor moving between patients would keep receiving messages
 * for every record they had opened this session.
 */
export function onCareMessage(assignmentId, handler) {
  const s = getSocket();
  s.emit("join_assignment", { assignment_id: assignmentId });
  s.on("care_message", handler);
  return () => {
    s.off("care_message", handler);
    s.emit("leave_assignment", { assignment_id: assignmentId });
  };
}
