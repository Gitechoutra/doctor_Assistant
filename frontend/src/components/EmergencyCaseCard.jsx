import { HiOutlineClock, HiOutlineHandRaised } from "react-icons/hi2";
import {
  Badge,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordDetail,
  cardLinkClass,
  cardPrimaryClass,
} from "./RecordCard";

export const SEVERITY_META = {
  critical: { label: "Critical", tone: "red" },
  serious: { label: "Serious", tone: "amber" },
  stable: { label: "Stable", tone: "slate" },
};

export const STATUS_META = {
  waiting: { label: "Unclaimed", tone: "amber" },
  in_progress: { label: "Being treated", tone: "emeraldSolid" },
  resolved: { label: "Resolved", tone: "slate" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

/**
 * One emergency case on the board.
 *
 * `canClaim` is whether this viewer may pick up an unclaimed case at all —
 * false for reception and admin, who log and monitor the board without ever
 * treating from it. An already-claimed case never offers the button, whoever
 * is looking: it belongs to the doctor who has it.
 */
export default function EmergencyCaseCard({ emergencyCase, canClaim = false, onClaim, onOpen, busy }) {
  const patient = emergencyCase.patient_detail || {};
  const severity = SEVERITY_META[emergencyCase.severity] || SEVERITY_META.stable;
  const status = STATUS_META[emergencyCase.status] || { label: emergencyCase.status, tone: "slate" };
  const claimable = canClaim && emergencyCase.status === "waiting";

  const arrivedAt = emergencyCase.arrived_at
    ? new Date(emergencyCase.arrived_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <RecordCard accent={emergencyCase.severity === "critical" ? "brand" : undefined}>
      <RecordCardBody>
        <RecordCardHeader
          name={patient.name || "Unknown patient"}
          imageUrl={patient.photo_url}
          lines={[patient.code || emergencyCase.code, emergencyCase.code]}
        />

        <RecordCardBadges>
          <Badge tone={severity.tone}>{severity.label}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </RecordCardBadges>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
          <RecordDetail label="Age" value={patient.age != null ? `${patient.age} yrs` : null} />
          <RecordDetail label="Gender" value={patient.gender} />
          <RecordDetail label="Arrived" value={arrivedAt} />
          <RecordDetail label="Doctor" value={emergencyCase.doctor || "Unclaimed"} />
        </div>

        <p className="mt-3 text-sm text-slate-500">
          <span className="font-medium text-slate-600">Reason:</span> {emergencyCase.reason}
        </p>
      </RecordCardBody>

      <RecordCardFooter>
        {claimable ? (
          <button
            onClick={() => onClaim(emergencyCase)}
            disabled={busy}
            className={cardPrimaryClass}
          >
            {busy ? (
              <>
                <HiOutlineClock className="h-4 w-4" />
                Claiming…
              </>
            ) : (
              <>
                <HiOutlineHandRaised className="h-4 w-4" />
                Claim
              </>
            )}
          </button>
        ) : (
          <span className="text-xs font-semibold text-slate-400">{status.label}</span>
        )}

        <button onClick={() => onOpen(emergencyCase)} className={cardLinkClass}>
          Open case
        </button>
      </RecordCardFooter>
    </RecordCard>
  );
}
