import { useCallback, useEffect, useRef, useState } from "react";
import { HiOutlinePaperAirplane } from "react-icons/hi2";
import Avatar from "../Avatar";
import { formatWhen } from "./NursingBadges";
import { useAuth } from "../../context/AuthContext";
import {
  fetchMessages,
  markMessagesRead,
  sendMessage,
} from "../../services/nursingService";
import { onCareMessage } from "../../services/socket";

/**
 * The doctor/nurse conversation about one patient.
 *
 * Live over a per-assignment socket room rather than the module-wide nursing
 * ping: a message has to land while someone is typing a reply, and refetching
 * the whole record for every keystroke-sized event would be wasteful.
 */
export default function MessageThread({ assignmentId, canMessage, counterpart }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const endRef = useRef(null);

  const load = useCallback(
    () =>
      fetchMessages(assignmentId)
        .then((rows) => {
          setMessages(rows);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load the conversation."))
        .finally(() => setLoading(false)),
    [assignmentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Opening the thread is what marks it read — the badge should clear because
  // someone looked, not because the page happened to poll.
  useEffect(() => {
    markMessagesRead(assignmentId).catch(() => {});
  }, [assignmentId, messages.length]);

  useEffect(() => {
    const unsubscribe = onCareMessage(assignmentId, (incoming) => {
      if (incoming?.assignment_id !== Number(assignmentId)) return;
      // The sender already appended their own copy optimistically below.
      setMessages((rows) =>
        rows.some((m) => m.id === incoming.id) ? rows : [...rows, incoming]
      );
    });
    return unsubscribe;
  }, [assignmentId]);

  // Follow the conversation down as it grows, the way any chat does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function handleSend(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setErrorMsg("");
    try {
      const saved = await sendMessage(assignmentId, text);
      setMessages((rows) => (rows.some((m) => m.id === saved.id) ? rows : [...rows, saved]));
      setBody("");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[32rem] flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">
          Messages{counterpart ? ` with ${counterpart}` : ""}
        </h2>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            No messages yet. Anything you send here is timestamped onto the
            patient&apos;s care record.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
              >
                <Avatar name={m.sender} imageUrl={m.sender_avatar_url} size="sm" />
                <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
                      mine
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {mine ? "You" : `${m.sender} · ${m.sender_role}`} ·{" "}
                    {formatWhen(m.created_at)}
                    {mine && m.read_at ? " · read" : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {errorMsg && (
        <p className="border-t border-slate-100 px-6 py-2 text-sm text-red-600">{errorMsg}</p>
      )}

      {canMessage ? (
        <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-100 p-4">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Message the ${counterpart ? counterpart.split(" ")[0] : "care team"}…`}
            maxLength={2000}
            className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-50"
          >
            <HiOutlinePaperAirplane className="h-4 w-4" />
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      ) : (
        <p className="border-t border-slate-100 px-6 py-3 text-center text-xs text-slate-400">
          Read-only — only the treating doctor and the assigned nurse can post here.
        </p>
      )}
    </div>
  );
}
