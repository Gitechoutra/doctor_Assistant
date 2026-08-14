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
 * Subscribes to the server's "something moved" ping.
 *
 * This is what keeps the PA's queue board and the doctor's queue in step
 * without either pressing refresh: the doctor calls a patient in, the server
 * broadcasts, and the number on the desk's screen moves. Returns an
 * unsubscribe function for the caller's cleanup.
 */
export function onDashboardChanged(handler) {
  const s = getSocket();
  s.on("dashboard_changed", handler);
  return () => s.off("dashboard_changed", handler);
}
