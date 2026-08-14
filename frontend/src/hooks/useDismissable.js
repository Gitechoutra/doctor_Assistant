import { useEffect } from "react";

/**
 * Closes a popover on an outside click or Escape.
 *
 * `ref` should wrap both the trigger and the panel — otherwise clicking the
 * trigger to close would fire this first and immediately reopen it.
 */
export default function useDismissable(ref, isOpen, onDismiss) {
  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onDismiss();
      }
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") onDismiss();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, isOpen, onDismiss]);
}
