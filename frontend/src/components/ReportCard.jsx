import { Link } from "react-router-dom";
import { HiOutlineArrowDownTray } from "react-icons/hi2";

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-700">{value ?? "—"}</p>
    </div>
  );
}

/**
 * One generated report, as a card. A single visit's report and the
 * consolidated report for a whole course of treatment both land in this list.
 */
export default function ReportCard({ report, onDownload, downloading }) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={
            report.kind === "case"
              ? `/dashboard/cases/${report.case_id}`
              : `/dashboard/consultations/${report.consultation_id}`
          }
          className="min-w-0 flex-1 truncate font-semibold text-slate-900 transition hover:text-brand-700"
        >
          {report.patient}
        </Link>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            report.kind === "case" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {report.kind === "case" ? "Full treatment" : "Single session"}
        </span>
      </div>

      {report.label && <p className="text-xs text-slate-400">{report.label}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Detail label="Doctor" value={report.doctor} />
        <Detail label="Generated" value={new Date(report.generated_at).toLocaleString()} />
      </div>

      <div className="mt-auto pt-1">
        <button
          onClick={() => onDownload(report)}
          disabled={downloading}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
        >
          <HiOutlineArrowDownTray className="h-3.5 w-3.5" />
          {downloading ? "Downloading…" : "Download"}
        </button>
      </div>
    </div>
  );
}
