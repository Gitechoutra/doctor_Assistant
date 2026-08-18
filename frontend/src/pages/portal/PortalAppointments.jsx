import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlinePlus,
  HiOutlineXCircle,
} from "react-icons/hi2";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import useLiveRefresh from "../../hooks/useLiveRefresh";
import { usePortalAuth } from "../../context/PortalAuthContext";
import doctorName from "../../utils/doctorName";
import {
  bookAppointment,
  cancelAppointment,
  fetchActiveAppointments,
} from "../../services/portalService";

/**
 * The patient's own appointments — everything still to happen.
 *
 * This list and the doctor's are the same rows read twice, so nothing here
 * "syncs": when the doctor calls the patient in, the status this page renders
 * changes because the field it renders changed. `useLiveRefresh` is what makes
 * that visible without a refresh — the same server push the practice's own
 * screens listen to, so the patient in the waiting room watching this page
 * sees "In Consultation" at the moment the doctor presses Start.
 *
 * A completed visit leaves this page entirely, because the server's active
 * list is `OPEN_STATUSES` and a finished appointment is not one. It reappears
 * under Past visits. There is no client-side filtering of statuses here at
 * all, deliberately: the split is the server's, and duplicating it in the
 * browser is how the two come to disagree.
 */

/** What each status means for the person waiting, as opposed to for the
 *  practice. The doctor's board says "Waiting" because that is the queue's
 *  word for it; the patient is the one waiting, and needs to be told what is
 *  actually happening. */
const PATIENT_NOTE = {
  scheduled: "Booked. Please arrive a few minutes early and check in at the desk.",
  waiting: "You are checked in. The doctor will call you shortly.",
  in_progress: "You are with the doctor now.",
};

function whenLabel(iso, fallback = "No time set") {
  if (!iso) return fallback;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The earliest the form will offer, matching the server's own lead time so a
 *  patient is not told "no" only after submitting. The server is still the
 *  boundary — this just keeps the form honest. */
function earliestBookable() {
  const when = new Date(Date.now() + 45 * 60 * 1000);
  // `datetime-local` wants local wall-clock time with no zone, so the offset
  // is subtracted before slicing rather than using toISOString directly.
  const offsetMs = when.getTimezoneOffset() * 60 * 1000;
  return new Date(when.getTime() - offsetMs).toISOString().slice(0, 16);
}

function BookModal({ onClose, onBooked, doctorLabel }) {
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      await bookAppointment({ scheduled_at: when, reason });
      onBooked();
      onClose();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not book that appointment."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Book an appointment">
      <form onSubmit={handleSubmit} className="space-y-4">
        {doctorLabel && (
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
            Your appointment will be with <strong>{doctorLabel}</strong>.
          </p>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            Date and time
          </label>
          <input
            type="datetime-local"
            value={when}
            min={earliestBookable()}
            onChange={(e) => setWhen(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            If you need to be seen today, please telephone the practice instead.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            What is it about?
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="A short note helps the doctor prepare — for example, a persistent cough."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {errorMsg && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !when}
            className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Booking…" : "Book appointment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PortalAppointments() {
  const { patient } = usePortalAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      setAppointments(await fetchActiveAppointments());
      setErrorMsg("");
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not load your appointments."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The doctor starting or ending a consultation moves this list, without the
  // patient touching anything.
  useLiveRefresh(load);

  async function handleCancel() {
    if (!cancelling) return;
    setBusy(true);
    try {
      await cancelAppointment(cancelling.id);
      setCancelling(null);
      await load(true);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not cancel that appointment."
      );
      setCancelling(null);
    } finally {
      setBusy(false);
    }
  }

  const myDoctor = doctorName(patient?.doctor?.name);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your appointments</h1>
          <p className="mt-1 text-sm text-slate-500">
            {myDoctor ? `With ${myDoctor}` : "With the practice"} — everything
            still to come.
          </p>
        </div>
        <button
          onClick={() => setBooking(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <HiOutlinePlus className="h-4 w-4" />
          Book an appointment
        </button>
      </header>

      {errorMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <HiOutlineCalendarDays className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            You have no appointments booked
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
            Book one above. Visits you have already had are under Past visits.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment) => (
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

              <p className="mt-2.5 flex items-center gap-1.5 text-base font-semibold text-slate-800">
                <HiOutlineClock className="h-4.5 w-4.5 shrink-0 text-slate-400" />
                {whenLabel(appointment.scheduled_at, "Walk-in — no time booked")}
              </p>

              {appointment.doctor && (
                <p className="mt-1 text-sm text-slate-500">
                  With {doctorName(appointment.doctor)}
                </p>
              )}

              {appointment.reason && (
                <p className="mt-2 text-sm text-slate-600">{appointment.reason}</p>
              )}

              {PATIENT_NOTE[appointment.status] && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                  {PATIENT_NOTE[appointment.status]}
                </p>
              )}

              {/* Only while it is still just a booking. Once they are checked
                  in they are in the building and in the queue, and the server
                  refuses — so offering the button would be a promise the API
                  will not keep. */}
              {appointment.status === "scheduled" && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setCancelling(appointment)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <HiOutlineXCircle className="h-4 w-4" />
                    Cancel this appointment
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {booking && (
        <BookModal
          onClose={() => setBooking(false)}
          onBooked={() => load(true)}
          doctorLabel={myDoctor}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title="Cancel this appointment?"
          message={`Your appointment on ${whenLabel(
            cancelling.scheduled_at
          )} will be cancelled. You can book another at any time.`}
          confirmLabel="Yes, cancel it"
          cancelLabel="Keep it"
          destructive
          busy={busy}
          onConfirm={handleCancel}
          onCancel={() => setCancelling(null)}
        />
      )}
    </div>
  );
}
