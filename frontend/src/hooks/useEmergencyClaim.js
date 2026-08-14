import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { claimEmergencyCase } from "../services/emergencyService";

/**
 * Claiming an emergency case, wherever a doctor happens to see one.
 *
 * The board, the Alerts page and the notification bell all offer the same
 * button, and "claimed" has to mean the same thing in all three: the case is
 * assigned server-side, the doctor lands on it ready to assess, and losing the
 * race to a colleague says so instead of failing quietly. Only the surrounding
 * markup differs, so only the markup lives in the callers.
 *
 * `onSettled(caseId, error)` runs on either outcome, before any navigation —
 * a list uses it to drop the row it just claimed, and (the case that matters)
 * to refresh when the claim was refused because somebody else got there first,
 * so the stale Claim button goes away with it.
 */
export default function useEmergencyClaim({ onSettled } = {}) {
  const navigate = useNavigate();
  const [claimingId, setClaimingId] = useState(null);
  // { caseId, message } — kept keyed by case so a list of several cases can
  // put the message against the one that actually failed.
  const [error, setError] = useState(null);

  const claim = useCallback(
    async (caseId) => {
      if (!caseId || claimingId) return false;
      setClaimingId(caseId);
      setError(null);
      try {
        await claimEmergencyCase(caseId);
        onSettled?.(caseId, null);
        // Straight onto the case: claiming it is this doctor saying they are
        // treating this patient now, so the next thing they need is the
        // assessment form, not the list they clicked from.
        navigate(`/dashboard/emergency/${caseId}`);
        return true;
      } catch (err) {
        setError({
          caseId,
          message: err.response?.data?.message || "Could not claim this case.",
        });
        onSettled?.(caseId, err);
        return false;
      } finally {
        setClaimingId(null);
      }
    },
    [claimingId, navigate, onSettled]
  );

  return { claim, claimingId, error };
}
