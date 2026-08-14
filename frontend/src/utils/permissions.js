/**
 * What each role may *do*, as opposed to what it may see.
 *
 * Read access is broad and stays that way: the PA runs the practice, which
 * means being able to answer a patient on the phone about a report, a
 * prescription or a past visit without asking the doctor. What is split is
 * *writing*, and the split is separation of duties rather than seniority:
 *
 *   * registering a patient is desk work        -> PA
 *   * booking and rescheduling is desk work     -> PA
 *   * running a consultation is clinical        -> doctor
 *   * prescribing and signing off is clinical   -> doctor
 *
 * These helpers only decide what to *render*. The server enforces the same
 * rules independently (`@front_desk_only`, `@doctor_only` and the
 * `_is_owning_doctor` guards in `helpers/decorators` and the consultation
 * routes), so a hand-crafted request is refused whatever the UI happens to be
 * showing. Hiding a control the API would 403 is a courtesy, never the
 * boundary.
 */

export const ROLE_PA = "pa";
export const ROLE_DOCTOR = "doctor";

/**
 * Registering a new patient. The PA's.
 *
 * A patient joins the practice through the desk and nowhere else — that is
 * what makes the patient code and the demographics a single accountable step,
 * recorded by whoever met them or took their call.
 */
export function canRegisterPatient(role) {
  return role === ROLE_PA;
}

/** Booking, checking in, rescheduling and cancelling. The PA's. */
export function canManageAppointments(role) {
  return role === ROLE_PA;
}

/** Correcting a registration. Both: the PA typed it, the doctor owns the
 *  clinical half of it, and an allergy noticed mid-consultation should not
 *  need the desk to fix. */
export function canEditPatient(role) {
  return role === ROLE_PA || role === ROLE_DOCTOR;
}

/** Removing a registration that should never have existed. The PA's, and the
 *  server refuses any patient who has a clinical record regardless. */
export function canDeletePatient(role) {
  return role === ROLE_PA;
}

/**
 * Starting, resuming, continuing or ending a consultation — and everything
 * recorded inside one: the diagnosis, the notes, the prescription, the
 * sign-off.
 *
 * The doctor's alone, and the server narrows it further to the doctor the
 * consultation actually belongs to. This just decides whether the button is
 * worth drawing.
 */
export function canRunConsultation(role) {
  return role === ROLE_DOCTOR;
}

/** Issuing a report. Clinical: it is the practice's formal account of a
 *  visit, and it carries the doctor's name. The PA may read and download
 *  every one of them. */
export function canGenerateReport(role) {
  return role === ROLE_DOCTOR;
}
