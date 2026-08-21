/**
 * The line between what the assistant does and what the doctor is responsible
 * for, stated in the two places it matters: the public page, where a practice
 * decides whether to trust the software, and the consultation room, above the
 * recorder that starts the conversation the suggestion will be drawn from.
 *
 * One component rather than the same sentences typed twice. A safety notice
 * that reads differently in two places invites the question of which one is
 * the real policy, and the answer has to be that there is only one.
 *
 * A clinical green, given as exact values rather than palette steps:
 * #F0F7F4 ground, #C9E4DA edge, #3A8F78 icon, #285C4D text. Emphasis inside
 * the note is carried by weight alone, so the whole strip reads as one colour.
 * It is the one place these screens step outside brand and slate, deliberately
 * — a note that matches everything around it is a note nobody reads.
 *
 * The icon is inline rather than from react-icons: this is the one graphic on
 * the page whose meaning is legal as much as visual, so it does not depend on
 * an icon set that could be swapped underneath it.
 */
export default function AiSafetyNote({ className = "" }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-xl border border-[#C9E4DA] bg-[#F0F7F4] px-4 py-3 sm:gap-3.5 sm:px-5 sm:py-3.5 ${className}`}
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-[#3A8F78]"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM9.25 8.75a.75.75 0 0 0 0 1.5h.25v2.5h-.5a.75.75 0 0 0 0 1.5h2a.75.75 0 0 0 0-1.5h-.25V9.5a.75.75 0 0 0-.75-.75h-.75Z"
          clipRule="evenodd"
        />
      </svg>

      {/* min-w-0 so a long line wraps inside the strip instead of widening it,
          which is what would push the recorder's column sideways on a phone. */}
      <div className="min-w-0 text-[13px] leading-relaxed text-[#285C4D] sm:text-sm">
        <p>
          <span className="font-bold">Note:</span> AI only provides medicine
          suggestions; it never prescribes or finalizes medicines.
        </p>
        <p className="mt-1 font-semibold">
          The doctor must review, verify, modify if needed, and approve the prescription before it
          is sent to the patient/pharmacy.
        </p>
      </div>
    </div>
  );
}
