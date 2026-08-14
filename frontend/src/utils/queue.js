/**
 * How an open OP list is read as per-doctor queues.
 *
 * Lives here rather than on a page or a card because three screens now need
 * the same answer and have to agree on it: the doctor cards on Appointments,
 * the doctor's own queue page, and the card summary inside each of them.
 */

/** Whose queue an OP belongs in: the doctor it was raised against, and only
 *  the patient's assigned doctor as a fallback for OPs raised before reception
 *  started stamping the doctor onto the OP itself. */
export function doctorIdOf(appointment) {
  return appointment.doctor_id ?? appointment.patient_detail?.assigned_doctor?.id ?? null;
}

/** This doctor's current patient (if any) and waiting list, in queue order. */
export function groupByDoctor(appointments) {
  const byDoctor = new Map();
  for (const appointment of appointments) {
    const doctorId = doctorIdOf(appointment);
    if (doctorId == null) continue;
    if (!byDoctor.has(doctorId)) byDoctor.set(doctorId, { current: null, waiting: [] });
    const bucket = byDoctor.get(doctorId);
    if (appointment.status === "in_progress") bucket.current = appointment;
    else if (appointment.status === "waiting") bucket.waiting.push(appointment);
  }
  return byDoctor;
}

/** One doctor's bucket out of the map above — an empty queue, never null, so
 *  a doctor with nobody waiting renders as an empty queue rather than a crash. */
export function bucketFor(byDoctor, doctorId) {
  return byDoctor.get(doctorId) || { current: null, waiting: [] };
}

/**
 * This doctor's queue as a flat, ordered list — one entry per current/next/
 * rest patient, each carrying the position number (1, 2, 3…) the desk
 * actually counts by: 1 is whoever is being seen, 2 is next, 3 onward is
 * everyone behind them. Computed locally per doctor rather than read off the
 * appointment's own `queue_number`, which counts across every doctor's queue
 * combined.
 *
 * Shared by the doctor card's summary text and the doctor's queue page.
 */
export function buildQueueEntries(current, waiting) {
  const next = waiting[0];
  const rest = waiting.slice(1);
  const nextNumber = current ? 2 : 1;
  const restNumbers = rest.map((_, i) => nextNumber + 1 + i);

  const entries = [
    ...(current ? [{ appointment: current, queueNumber: 1, isNext: false }] : []),
    ...(next ? [{ appointment: next, queueNumber: nextNumber, isNext: true }] : []),
    ...rest.map((appointment, i) => ({
      appointment,
      queueNumber: restNumbers[i],
      isNext: false,
    })),
  ];

  return { entries, next, restNumbers };
}
