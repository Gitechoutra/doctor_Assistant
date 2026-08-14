import { useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckBadge,
  HiOutlineChevronDown,
  HiOutlineClock,
  HiOutlineDocumentText,
} from "react-icons/hi2";
import {
  Badge,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordCardPanel,
  cardLinkClass,
  cardToggleClass,
} from "./RecordCard";

function formatDuration(seconds) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function Section({ title, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1 break-words text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function TextOrDash({ value }) {
  return value ? <p className="whitespace-pre-line">{value}</p> : <p className="text-slate-400">—</p>;
}

/** One prescribed medicine, stacked rather than tabulated — the card is a
 *  third of a row wide, so a four-column table could only be read sideways. */
function MedicineRow({ medicine }) {
  const schedule = [medicine.dose, medicine.frequency, medicine.duration]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-xl border border-slate-100 bg-white px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium text-slate-800">
          {medicine.medicine_name}
        </p>
        {!medicine.matched_formulary && (
          // Gemini may name something outside the practice's formulary; the
          // doctor should notice that.
          <span
            title="Not in the practice's formulary"
            className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
          >
            off-formulary
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{schedule || "No schedule recorded"}</p>
    </li>
  );
}

export default function ConsultationCard({ consultation, onDownloadReport, downloading }) {
  const [expanded, setExpanded] = useState(false);
  const patient = consultation.patient_detail || {};
  const summary = consultation.summary;
  const prescriptions = consultation.prescriptions || [];
  const report = consultation.report;

  const when = consultation.ended_at || consultation.started_at;
  const dateLabel = when ? new Date(when).toLocaleString() : "—";

  return (
    <RecordCard>
      <RecordCardBody>
        <RecordCardHeader
          name={patient.name || consultation.patient}
          imageUrl={patient.photo_url}
          lines={[
            [
              patient.code || `PAT${consultation.patient_id}`,
              patient.age != null && `${patient.age} yrs`,
              patient.gender,
            ]
              .filter(Boolean)
              .join(" · "),
            consultation.doctor,
          ]}
        />

        <RecordCardBadges>
          <Badge tone="emeraldSolid">Completed</Badge>
          {/* Only when the case really has several — a lone "Session 1" tag
              on an ordinary one-visit consultation is just noise. */}
          {consultation.case?.session_count > 1 && consultation.session_number && (
            <Badge tone="brand">
              Session {consultation.session_number} of {consultation.case.session_count}
            </Badge>
          )}
          {prescriptions.length > 0 && (
            <Badge
              tone={consultation.prescription_verified ? "emerald" : "amber"}
              icon={HiOutlineCheckBadge}
              title={
                consultation.prescription_verified
                  ? `Verified by ${consultation.prescription_verified_by || "the treating doctor"}`
                  : "The treating doctor has not signed off these medicines yet"
              }
            >
              {consultation.prescription_verified ? "Rx verified" : "Rx unverified"}
            </Badge>
          )}
          {report && (
            <Badge tone="brand" icon={HiOutlineDocumentText}>
              Report ready
            </Badge>
          )}
        </RecordCardBadges>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span>{dateLabel}</span>
          <span className="inline-flex items-center gap-1">
            <HiOutlineClock className="h-4 w-4 text-slate-400" />
            {formatDuration(consultation.duration_seconds)}
          </span>
        </div>

        {expanded && (
          <RecordCardPanel>
            {!summary ? (
              <p className="text-sm text-slate-400">
                No AI summary was recorded for this consultation.
              </p>
            ) : (
              <div className="grid gap-4">
                <Section title="Symptoms">
                  <TextOrDash value={summary.symptoms} />
                </Section>
                <Section title="Consultation notes">
                  <TextOrDash value={summary.summary} />
                </Section>
              </div>
            )}

            <div className="mt-4">
              <Section title={`Prescription (${prescriptions.length})`}>
                {prescriptions.length === 0 ? (
                  <p className="text-slate-400">No medicines were prescribed.</p>
                ) : (
                  <ul className="mt-1 max-h-72 space-y-2 overflow-y-auto">
                    {prescriptions.map((p, i) => (
                      <MedicineRow key={i} medicine={p} />
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <Link
                to={`/dashboard/consultations/${consultation.id}`}
                className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
              >
                Open full consultation &amp; transcript →
              </Link>
              {consultation.case_id && (
                <Link
                  to={`/dashboard/cases/${consultation.case_id}`}
                  className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
                >
                  View the whole course of treatment →
                </Link>
              )}
            </div>
          </RecordCardPanel>
        )}
      </RecordCardBody>

      <RecordCardFooter>
        {report ? (
          <button
            onClick={() => onDownloadReport(consultation)}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
          >
            <HiOutlineArrowDownTray className="h-4 w-4" />
            {downloading ? "Downloading…" : "Report"}
          </button>
        ) : (
          <Link to={`/dashboard/consultations/${consultation.id}`} className={cardLinkClass}>
            Generate report
          </Link>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cardToggleClass}
        >
          {expanded ? "Less" : "Details"}
          <HiOutlineChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      </RecordCardFooter>
    </RecordCard>
  );
}
