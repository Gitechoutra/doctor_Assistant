/**
 * A recorded consultation laid out as the conversation it was.
 *
 * Doctor and patient are on opposite sides in different colours, because the
 * question a doctor asks of a transcript is almost never "what was said" — it
 * is "what did the *patient* say". A wall of prose makes that a reading
 * exercise; two alternating columns make it a glance.
 *
 * The same component draws the live transcript in the consultation room and
 * the reconstructed one under the AI summary, so the conversation does not
 * change appearance the moment the doctor presses End.
 *
 * Speakers are inferred, never recorded. `TranscriptCaveat` below says so in
 * one line, and belongs anywhere these turns could be read as a verified
 * record of who spoke.
 */
export function ConversationTurn({ turn }) {
  const isDoctor = turn.speaker === "doctor";
  return (
    <div className={`flex ${isDoctor ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[80%] ${
          isDoctor
            ? "rounded-tl-sm bg-slate-100 text-slate-700"
            : "rounded-tr-sm bg-brand-600 text-white"
        }`}
      >
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">
          {turn.speaker}
        </p>
        {turn.text}
      </div>
    </div>
  );
}

/** The one line that keeps an inferred split from reading as a verified one. */
export function TranscriptCaveat({ className = "" }) {
  return (
    <p className={`text-xs italic text-slate-400 ${className}`}>
      AI-reconstructed from the recording — speakers were not manually tagged, so this is an
      inferred best guess.
    </p>
  );
}

export default function ConversationTurns({ turns, className = "" }) {
  if (!turns?.length) return null;
  return (
    <div className={`space-y-2 ${className}`}>
      {turns.map((turn, i) => (
        <ConversationTurn key={i} turn={turn} />
      ))}
    </div>
  );
}
