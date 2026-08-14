/**
 * The medicine vocabularies, in one place.
 *
 * Dosage forms and routes were previously spelled out in the prescription
 * editor, the pharmacy medicine form and the doctor-requests page. Three
 * copies of the same list is three chances for them to disagree — and the
 * values are contracts with the backend enums (`medicine_brand.FORMS`,
 * `medication_order.ROUTES`), so a drift here is a validation error there.
 */

export const FORM_OPTIONS = [
  ["tablet", "Tablet"],
  ["capsule", "Capsule"],
  ["syrup", "Syrup"],
  ["injection", "Injection"],
  ["iv_fluid", "IV Fluid"],
  ["ointment", "Ointment / Cream"],
  ["drops", "Drops"],
  ["inhaler", "Inhaler"],
  ["sachet", "Sachet"],
  ["other", "Other"],
];

// Route of administration. The leading blank entry is the "not specified"
// choice a select needs; ROUTE_LABELS drops it, since there is nothing to
// label when no route was recorded.
export const ROUTE_OPTIONS = [
  ["", "Not specified"],
  ["oral", "Tablet / Oral"],
  ["injection", "Injection"],
  ["iv", "IV / Saline"],
  ["topical", "Topical"],
  ["inhalation", "Inhalation"],
  ["other", "Other"],
];

export const ROUTE_LABELS = Object.fromEntries(
  ROUTE_OPTIONS.filter(([value]) => value)
);
