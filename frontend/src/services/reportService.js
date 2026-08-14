import api from "./api";

export async function fetchReports() {
  const res = await api.get("/reports");
  return res.data.data;
}

export async function generateReport(consultationId) {
  const res = await api.post("/reports", { consultation_id: consultationId });
  return res.data.data;
}

// The consolidated report for a whole course of treatment: every session in
// order, followed by the single final prescription.
export async function generateCaseReport(caseId) {
  const res = await api.post("/reports", { case_id: caseId });
  return res.data.data;
}

// The download endpoint requires the JWT auth header, so a plain <a href>
// won't carry it — fetch the PDF as a blob (through the authenticated axios
// instance) and trigger the browser's save dialog manually. Generic over
// `path` so any PDF-download endpoint in the app (reports, the OP document)
// can use the same two primitives below instead of re-implementing them.
async function fetchPdfBlobUrl(path) {
  const res = await api.get(path, { responseType: "blob" });
  return window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
}

export async function downloadPdf(path, suggestedName) {
  const url = await fetchPdfBlobUrl(path);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Opens the PDF in a new tab, where the browser's own viewer offers both
 * Print and Save. Falls back to a straight download when a popup blocker
 * stops the tab from opening, so the button always does something.
 *
 * Returns true if the tab opened, false if it fell back to downloading.
 */
export async function openPdfForPrint(path, suggestedName) {
  const url = await fetchPdfBlobUrl(path);
  const tab = window.open(url, "_blank");

  if (!tab) {
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return false;
  }

  // The tab needs the object URL to stay alive while it loads; revoking
  // immediately would leave it blank.
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  return true;
}

export async function downloadReport(reportId, suggestedName = "consultation_report.pdf") {
  return downloadPdf(`/reports/${reportId}/download`, suggestedName);
}

export async function openReportForPrint(reportId, suggestedName = "consultation_report.pdf") {
  return openPdfForPrint(`/reports/${reportId}/download`, suggestedName);
}
