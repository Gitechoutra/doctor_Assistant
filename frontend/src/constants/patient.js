/**
 * Registration vocabulary shared by the add and edit patient forms.
 *
 * Kept in one place because the two forms are the same form twice — one for a
 * new patient, one for correcting an existing one — and a list that only half
 * of them knows about is how "P+" gets into the record in the first place.
 */

/** The eight ABO/Rh groups. Mirrors `BLOOD_GROUPS` in models/patient.py, which
 *  is the boundary that actually enforces them — the API rejects anything else
 *  whatever the browser sends. Keep the two in step. */
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** Whether a stored value is one this form can show.
 *
 *  Blank counts: blood group is optional at registration, and reception often
 *  does not have it yet. What this catches is a record written before the
 *  field was a closed list — see the warning in EditPatientModal. */
export function isValidBloodGroup(value) {
  return !value || BLOOD_GROUPS.includes(value);
}
