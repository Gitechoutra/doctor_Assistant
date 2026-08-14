import { useEffect, useRef, useState } from "react";
import { HiOutlineChatBubbleLeftRight, HiOutlineLockClosed, HiOutlinePaperAirplane } from "react-icons/hi2";
import Avatar from "../Avatar";
import { useAuth } from "../../context/AuthContext";
import { fetchLabMessages, postLabMessage } from "../../services/labService";
import { formatWhen } from "./LabBits";

/**
 * The discussion attached to one lab request.
 *
 * Scoped to a single patient's single test by construction: this component
 * takes a request id and has no way to reach any other thread. Only the
 * requesting doctor and the assigned technician can read or post — the server
 * decides that and reports it as `can_discuss`, which is what gates the
 * composer here. Rendering a disabled box for everyone else would only
 * advertise that a private conversation exists.
 *
 * Status changes arrive in the same list as `system` entries, so the history
 * reads in one pass instead of forcing the reader to reconcile two timelines.
 */
export default function LabDiscussion({ requestId, canDiscuss, onPosted }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchLabMessages(requestId)
      .then((data) => active && setMessages(data.items || []))
      .catch(
        (err) =>
          active &&
          setErrorMsg(err.response?.data?.message || "Could not load this discussion.")
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [requestId]);

  // Follow the thread down as it grows, the way any message list should.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setErrorMsg("");
    try {
      const saved = await postLabMessage(requestId, text);
      setMessages((list) => [...list, saved]);
      setBody("");
      onPosted?.();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not post that message.");
    } finally {
      setSending(false);
    }
  }

  if (!canDiscuss) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <HiOutlineLockClosed className="h-5 w-5 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Discussion</h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Only the requesting doctor and the assigned lab technician can see the discussion
          for this test.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <HiOutlineChatBubbleLeftRight className="h-5 w-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-slate-900">Discussion &amp; history</h2>
        </div>
      </div>

      <div className="max-h-[28rem] min-h-40 space-y-3 overflow-y-auto px-5 py-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Nothing here yet. Anything either of you writes about this test stays on the
            request.
          </p>
        ) : (
          messages.map((m) =>
            m.kind === "system" ? (
              // A status change, an upload, a recollection. Centred and muted
              // so it reads as something that happened rather than something
              // somebody said.
              <p
                key={m.id}
                className="mx-auto max-w-lg rounded-full bg-slate-50 px-3 py-1.5 text-center text-xs text-slate-500"
              >
                {m.body}
                <span className="ml-1.5 text-slate-400">· {formatWhen(m.created_at)}</span>
              </p>
            ) : (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.author_id === user?.id ? "flex-row-reverse" : ""}`}
              >
                <Avatar name={m.author} size="sm" />
                <div className={`min-w-0 max-w-[85%] ${m.author_id === user?.id ? "text-right" : ""}`}>
                  <p className="text-xs text-slate-400">
                    <span className="font-semibold text-slate-600">{m.author || "Unknown"}</span>
                    {" · "}
                    {formatWhen(m.created_at)}
                  </p>
                  <div
                    className={`mt-0.5 inline-block whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-left text-sm ${
                      m.author_id === user?.id
                        ? "rounded-tr-sm bg-brand-600 text-white"
                        : "rounded-tl-sm bg-slate-100 text-slate-700"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            )
          )
        )}
        <div ref={endRef} />
      </div>

      {errorMsg && (
        <p className="mx-5 mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMsg}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-100 p-4">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — what anyone typing
            // into a message box expects.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Ask about the sample, the result, or the patient's preparation…"
          className="min-w-0 flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          aria-label="Send message"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 text-white shadow-md transition hover:shadow-lg disabled:opacity-50"
        >
          <HiOutlinePaperAirplane className="h-4.5 w-4.5" />
        </button>
      </form>
    </div>
  );
}
