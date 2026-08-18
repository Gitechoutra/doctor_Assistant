import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentText,
} from "react-icons/hi2";
import StatusBadge from "../../components/StatusBadge";
import useLiveRefresh from "../../hooks/useLiveRefresh";
import { fetchAppointmentHistory } from "../../services/portalService";
import doctorName from "../../utils/doctorName";

/**
 * Past visits — the other half of the patient's appointments.
 *
 * The server splits on `CLOSED_STATUSES`, the exact complement of the active
 * list's `OPEN_STATUSES`, so an appointment is always on one of these two
 * pages and never on both or neither. The moment the doctor ends a
 * consultation it moves from that page to this one, because that is one field
 * changing under two queries.
 *
 * What this page does *not* show is the clinical record. A finished visit says
 * that it happened, when, and whether a report has been issued — it does not
 * carry the consultation summary, the assistive diagnosis or the prescription.
 * Those are the doctor's account of the visit and the practice issues them
 * deliberately; a patient reading an AI-drafted "possible diagnosis" out of an
 * API response is not the same thing as a doctor going through it with them.
 */

const FILTERS = [
  { key: "", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function whenLabel(iso) {
  if (!iso) return "No date recorded";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PortalHistory() {
  const [filter, setFilter] = useState("");
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      try {
        const result = await fetchAppointmentHistory({
          page,
          page_size: 20,
          ...(filter ? { status: filter } : {}),
        });
        setItems(result.items || []);
        setMeta(result.meta || {});
        setErrorMsg("");
      } catch (err) {
        setErrorMsg(
          err.response?.data?.message || "Could not load your past visits."
        );
      } finally {
        setLoading(false);
      }
    },
    [filter, page]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A visit finishing lands here, so this page listens for the same push the
  // active list does — otherwise a patient who happened to be on this tab when
  // the doctor pressed End would not see the visit arrive.
  useLiveRefresh(load);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Past visits</h1>
        <p className="mt-1 text-sm text-slate-500">
          Appointments that have been completed, and any you called off.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key || "all"}
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <HiOutlineClipboardDocumentList className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            Nothing here yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
            Once you have been seen, your visits will be listed here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((appointment) => (
            <article
              key={appointment.id}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={appointment.status}
                  label={appointment.status_label}
                />
                <span className="text-xs text-slate-400">{appointment.code}</span>
              </div>

              <p className="mt-2.5 text-base font-semibold text-slate-800">
                {whenLabel(appointment.scheduled_at || appointment.created_at)}
              </p>

              {appointment.doctor && (
                <p className="mt-1 text-sm text-slate-500">
                  Seen by {doctorName(appointment.doctor)}
                </p>
              )}

              {appointment.reason && (
                <p className="mt-2 text-sm text-slate-600">{appointment.reason}</p>
              )}

              {appointment.status === "cancelled" && appointment.cancelled_reason && (
                <p className="mt-2 text-xs text-slate-400">
                  {appointment.cancelled_reason}
                </p>
              )}

              {appointment.status === "completed" && (
                <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                  {appointment.report_ready ? (
                    <>
                      <HiOutlineDocumentText className="h-4 w-4 shrink-0 text-emerald-600" />
                      Your report is ready — ask the practice for a copy.
                    </>
                  ) : (
                    <>
                      <HiOutlineCheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                      This consultation is complete.
                    </>
                  )}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {meta.pages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-slate-400">
            Page {meta.page} of {meta.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
            disabled={page >= meta.pages}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
