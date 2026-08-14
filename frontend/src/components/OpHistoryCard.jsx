import { useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineChevronDown } from "react-icons/hi2";
import {
  Badge,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordCardPanel,
  RecordDetail,
  cardLinkClass,
  cardToggleClass,
} from "./RecordCard";

const STATUS_META = {
  completed: { label: "Completed", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

function formatWhen(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

/** One label-over-text block in the expanded panel. */
function DetailBlock({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">
        {children || <span className="text-slate-400">—</span>}
      </p>
    </div>
  );
}

/**
 * One closed OP in the history, with the visit it produced folded inside it.
 *
 * Collapsed it is the OP record the front desk raised; expanded it is the
 * consultation that closed it — diagnosis, advice and the medicines
 * prescribed. Nothing here is editable: a consultation is changed in the
 * consultation room by the treating doctor, and this is the record of what
 * happened, not a second place to change it.
 */
export default function OpHistoryCard({ record }) {
  const [expanded, setExpanded] = useState(false);

  const patient = record.patient_detail || {};
  const consultation = record.consultation;
  const summary = consultation?.summary;
  const medicines = consultation?.prescriptions || [];
  const status = STATUS_META[record.status] || {
    label: record.status,
    tone: "slate",
  };

  return (
    <RecordCard>
      <RecordCardBody>
        <RecordCardHeader
          name={patient.name || record.patient}
          imageUrl={patient.photo_url}
          lines={[
            patient.code || `PAT${record.patient_id}`,
            [record.doctor, record.department].filter(Boolean).join(" · ") || "—",
          ]}
        />

        <RecordCardBadges>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone="slate">{record.code}</Badge>
          {record.payment_type ? (
            <Badge tone="brand">OP: {record.payment_type}</Badge>
          ) : (
            <Badge>OP: Free</Badge>
          )}
          {consultation?.session_number > 1 && (
            <Badge tone="brand">Session {consultation.session_number}</Badge>
          )}
        </RecordCardBadges>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
          <RecordDetail label="Age" value={patient.age != null ? `${patient.age} yrs` : null} />
          <RecordDetail label="Gender" value={patient.gender} />
          <RecordDetail label="Raised" value={formatWhen(record.created_at)} />
          <RecordDetail
            label="Medicines"
            value={consultation ? String(medicines.length) : "—"}
          />
        </div>

        {record.reason && (
          <p className="mt-3 text-sm text-slate-500">
            <span className="font-medium text-slate-600">Reason:</span> {record.reason}
          </p>
        )}

        {expanded && (
          <RecordCardPanel>
            {!consultation ? (
              // A cancelled OP, or one closed against a visit that was never
              // recorded — there is genuinely nothing clinical to show.
              <p className="text-sm text-slate-400">
                No consultation was recorded against this OP.
              </p>
            ) : (
              <div className="space-y-3">
                <DetailBlock title="Consulted">
                  {formatWhen(consultation.ended_at || consultation.started_at)}
                </DetailBlock>
                <DetailBlock title="Symptoms">{summary?.symptoms}</DetailBlock>
                <DetailBlock title="Possible diagnosis">
                  {summary?.possible_diagnosis}
                </DetailBlock>
                <DetailBlock title="Summary">{summary?.summary}</DetailBlock>
                <DetailBlock title="Follow-up advice">
                  {summary?.follow_up_advice}
                </DetailBlock>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Medicines prescribed
                  </p>
                  {medicines.length === 0 ? (
                    <p className="mt-0.5 text-sm text-slate-400">
                      No medicines were prescribed.
                    </p>
                  ) : (
                    <ul className="mt-1 max-h-60 space-y-2 overflow-y-auto">
                      {medicines.map((m, i) => (
                        <li
                          key={i}
                          className="rounded-xl border border-slate-100 bg-white px-3 py-2"
                        >
                          <p className="break-words text-sm font-medium text-slate-800">
                            {m.medicine_name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ") ||
                              "No schedule recorded"}
                          </p>
                          {m.instructions && (
                            <p className="mt-0.5 text-xs text-slate-500">{m.instructions}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </RecordCardPanel>
        )}
      </RecordCardBody>

      <RecordCardFooter>
        {record.consultation_id ? (
          <Link
            to={`/dashboard/consultations/${record.consultation_id}`}
            className={cardLinkClass}
          >
            Open consultation
          </Link>
        ) : (
          <span className="text-xs font-semibold text-slate-400">{status.label}</span>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cardToggleClass}
        >
          {expanded ? "Less" : "Details"}
          <HiOutlineChevronDown
            className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </RecordCardFooter>
    </RecordCard>
  );
}
