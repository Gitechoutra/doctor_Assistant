import {
  HiOutlineArrowPathRoundedSquare,
  HiOutlineBeaker,
  HiOutlineCheckBadge,
  HiOutlineClipboardDocumentCheck,
  HiOutlineDocumentText,
  HiOutlineXCircle,
} from "react-icons/hi2";
import { Badge } from "../RecordCard";

/**
 * Small pieces shared by every laboratory screen, so a status looks the same
 * on the technician's worklist, the doctor's orders page and the detail view.
 */

export const LAB_STATUS_META = {
  ordered: { label: "Ordered", tone: "slate", icon: HiOutlineClipboardDocumentCheck },
  sample_collected: { label: "Sample collected", tone: "brand", icon: HiOutlineBeaker },
  processing: { label: "Processing", tone: "amber", icon: HiOutlineBeaker },
  completed: { label: "Completed", tone: "emeraldSolid", icon: HiOutlineDocumentText },
  verified: { label: "Verified", tone: "emerald", icon: HiOutlineCheckBadge },
  cancelled: { label: "Cancelled", tone: "slateSolid", icon: HiOutlineXCircle },
};

/** The order a request moves through. Drives the progress rail and the
 *  "what's next" button, so the two can never disagree. */
export const LAB_FLOW = ["ordered", "sample_collected", "processing", "completed", "verified"];

export function LabStatusBadge({ status }) {
  const meta = LAB_STATUS_META[status] || { label: status, tone: "slate" };
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }) {
  if (priority !== "urgent") return null;
  return <Badge tone="amber">Urgent</Badge>;
}

export function RecollectionBadge({ request }) {
  if (!request.recollection_requested) return null;
  return (
    <Badge
      tone="amber"
      icon={HiOutlineArrowPathRoundedSquare}
      title={request.recollection_reason || "A fresh sample is needed"}
    >
      Recollection needed
    </Badge>
  );
}

/**
 * Where the test has got to, at a glance.
 *
 * A cancelled request gets no rail — it did not travel the path, it left it,
 * and drawing four grey dots for it would suggest it is merely early.
 */
export function LabProgress({ status }) {
  if (status === "cancelled") return null;
  const current = LAB_FLOW.indexOf(status);

  return (
    <ol className="mt-3 flex items-center gap-1" aria-label="Test progress">
      {LAB_FLOW.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step} className="flex flex-1 items-center gap-1">
            <span
              title={LAB_STATUS_META[step].label}
              className={`h-1.5 w-full rounded-full transition ${
                done ? "bg-brand-500" : "bg-slate-200"
              }`}
            />
          </li>
        );
      })}
    </ol>
  );
}

export function formatWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}
