import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineArrowPath } from "react-icons/hi2";
import QueueBoard from "../components/QueueBoard";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { useAuth } from "../context/AuthContext";
import { fetchQueue, startAppointment } from "../services/appointmentService";

/**
 * The day's queue — the one screen both roles work from.
 *
 * Deliberately the same page for each, rather than a PA queue and a doctor
 * queue that could drift. What differs is one button: the doctor can call the
 * next patient in, the PA cannot (and the API refuses them regardless). Both
 * see identical positions, because both read them from the same endpoint.
 *
 * `useLiveRefresh` is what makes it feel joined up: the doctor presses Start
 * and the server broadcasts, so the desk's board moves within the second
 * without anybody reloading.
 */
export default function PatientQueue() {
  const { isDoctor } = useAuth();
  const navigate = useNavigate();

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [startingId, setStartingId] = useState(null);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      setQueue(await fetchQueue());
      setErrorMsg("");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not load the queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load);

  async function handleStart(appointment) {
    setStartingId(appointment.id);
    setErrorMsg("");
    try {
      const consultation = await startAppointment(appointment.id);
      navigate(`/dashboard/consultations/${consultation.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not start this consultation.");
      // The queue may have moved under us — a second tab, or the desk
      // cancelling. Re-read rather than leaving a stale board on screen.
      load(true);
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patient Queue</h1>
        </div>
        <button
          onClick={() => load(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
        >
          <HiOutlineArrowPath className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {errorMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <QueueBoard
          queue={queue}
          onStart={isDoctor ? handleStart : undefined}
          startingId={startingId}
          emptyMessage={
            isDoctor
              ? "Nobody is waiting. Patients appear here as the PA checks them in."
              : "Nobody is waiting. Book a walk-in from the patient's record, or check in an arrival from Appointments."
          }
        />
      )}
    </div>
  );
}
