/**
 * What each role may *do*, as opposed to what it may see.
 *
 * Read access is broad and stays that way — an administrator monitors the
 * whole hospital. These are the operational workflows that belong to exactly
 * one role each, and the rule is separation rather than seniority:
 *
 *   * registering a patient is front-desk work -> receptionist
 *   * raising an OP is front-desk work         -> receptionist
 *   * running a consultation is clinical       -> doctor
 *
 * Admin is deliberately in none of them. It is a monitoring and administration
 * role: it can watch a consultation's status and read the queue, but it does
 * not admit patients, does not call them in and does not see them.
 *
 * These helpers only decide what to *render*. The server enforces the same
 * rules independently (see `patient_routes.create_patient`,
 * `appointment_routes.create_appointment` and the `get_current_doctor` /
 * `_is_owning_doctor` guards in the consultation routes), so a hand-crafted
 * request from a signed-in doctor or admin is refused whatever the UI happens
 * to be showing. Hiding a control the API would 403 is a courtesy, never the
 * boundary.
 */

/**
 * Registering a new patient. Front desk only.
 *
 * A patient enters the hospital through reception and nowhere else — that is
 * what makes the patient code, the demographics and the choice of treating
 * doctor a single accountable step. A doctor who could register would be
 * assigning a patient to themselves, which is exactly the routing decision
 * the front desk owns.
 */
export function canRegisterPatient(role) {
  return role === "receptionist";
}

/** Raising an outpatient visit and managing the queue. Front desk only. */
export function canCreateOp(role) {
  return role === "receptionist";
}

/**
 * Re-routing a patient to a different doctor.
 *
 * Wider than registration on purpose: this is a correction to an existing
 * record rather than an admission, and admin has to be able to unstick a
 * patient the front desk mis-routed. Mirrors `FRONT_DESK_ROLES` on the server,
 * which is what `PATCH /patients/<id>/assignment` allows.
 */
export function canReassignDoctor(role) {
  return role === "receptionist" || role === "admin";
}

/**
 * Starting, resuming, continuing or ending a consultation.
 *
 * Doctors only, and the server narrows it further to the doctor the
 * consultation actually belongs to — this just decides whether the button is
 * worth drawing at all.
 */
export function canRunConsultation(role) {
  return role === "doctor";
}

/**
 * Logging an Emergency Case. Front desk only, same as `canCreateOp` — this
 * is intake work, and admin stays out of it for the same reason it stays out
 * of raising an OP: it monitors the emergency board, it does not admit onto
 * it.
 */
export function canCreateEmergencyCase(role) {
  return role === "receptionist";
}

/**
 * Claiming, assessing and resolving an Emergency Case. Doctors only, same
 * separation as `canRunConsultation` — admin can watch a case move through
 * the board but never treats one.
 */
export function canTreatEmergencyCase(role) {
  return role === "doctor";
}

/**
 * Administrative corrections on an Emergency Case that aren't treatment —
 * linking an OP that already exists, withdrawing a mis-registered case.
 * Wider than `canCreateEmergencyCase` on purpose, mirroring
 * `canReassignDoctor`: admin has to be able to fix a case reception got
 * wrong, the same way it can fix a mis-routed patient.
 */
export function canManageEmergencyCase(role) {
  return role === "receptionist" || role === "admin";
}
