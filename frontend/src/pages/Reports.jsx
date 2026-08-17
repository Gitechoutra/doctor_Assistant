import { useCallback, useEffect, useState } from "react";
import ReportCard from "../components/ReportCard";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchReports, downloadReport } from "../services/reportService";

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return fetchReports()
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A report generated elsewhere should appear without a page refresh.
  useLiveRefresh(load);

  async function handleDownload(report) {
    setDownloadingId(report.id);
    try {
      const name = (report.patient || "patient").replace(/\s+/g, "_");
      const suffix = report.kind === "case" ? "full_medical_report" : "consultation_report";
      await downloadReport(report.id, `${name}_${suffix}.pdf`);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Reports</h1>

      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <p className="mx-auto max-w-xl text-sm text-slate-400">
              No reports yet. A visit report appears here once the doctor has signed
              off that consultation&rsquo;s prescription; a full-treatment report appears
              when a case is closed and its final prescription is signed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                downloading={downloadingId === r.id}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
