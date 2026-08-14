import { useEffect } from "react";
import Modal from "./Modal";

/**
 * A yes/no gate in front of a consequential action.
 *
 * Escape cancels, matching what the X button does — a confirmation the user
 * can't back out of with the keyboard is a trap.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  // Colours the confirm button red for an action that destroys something.
  // Off by default, so every existing confirmation looks exactly as it did.
  destructive = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <Modal title={title} onClose={busy ? () => {} : onCancel}>
      {/* pre-line: a confirmation that explains a consequential action often
          needs a paragraph break, and collapsing it into one block is what
          makes people stop reading it. */}
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{message}</p>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          autoFocus
          className={`rounded-xl bg-gradient-to-r px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60 ${
            destructive
              ? "from-red-500 to-red-600"
              : "from-emerald-500 to-emerald-600"
          }`}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
