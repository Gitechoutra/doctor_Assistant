/**
 * Phone and email rules, as the forms enforce them.
 *
 * Mirrors backend/portal/helpers/contact.py, which is the boundary that
 * actually decides — everything here exists so the person filling the form
 * finds out while they are typing rather than when they press Save. Keep the
 * two in step: the digit count and the domain list appear in both.
 */

/** Exactly ten digits — an Indian mobile. Mirrors PHONE_DIGITS in
 *  helpers/contact.py. */
export const PHONE_DIGITS = 10;

/** Everything that is not a digit, dropped, capped at the full length.
 *
 *  Lets a pasted "+91 98765 43210" become a usable number instead of an error
 *  somebody has to clean up by hand, while typing a letter or a symbol simply
 *  does nothing — the field cannot hold one to begin with. */
export function digitsOnly(value) {
  return (value || "").replace(/\D/g, "").slice(0, PHONE_DIGITS);
}

/** A number that has been started but not finished. Optional fields are
 *  allowed to be empty; they are not allowed to be half-typed, because a
 *  nine-digit number is not nearly valid — it reaches the wrong person.
 *
 *  Null and undefined count as empty, like everything else in this module: a
 *  record with no phone on file sends one back as JSON null, and a validator
 *  that throws on "nothing was recorded" takes the whole form down with it. */
export function isPhoneIncomplete(value) {
  const phone = value || "";
  return phone.length > 0 && phone.length < PHONE_DIGITS;
}

export const PHONE_ERROR = `Mobile number must be exactly ${PHONE_DIGITS} digits.`;

/** Domains an address may be at. Mirrors DEFAULT_EMAIL_DOMAINS in
 *  helpers/contact.py, where it is configurable per deployment
 *  (ALLOWED_EMAIL_DOMAINS) — if that is changed, change this too or the form
 *  will refuse an address the server would have taken. */
export const EMAIL_DOMAINS = ["gmail.com", "outlook.com"];

/** Shape only. The domain check below is what actually decides. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Whether an identifier is an address rather than a username — the '@' is the
 *  whole test, matching `_find_by_identifier` on the server. */
export function looksLikeEmail(value) {
  return (value || "").includes("@");
}

/** Empty counts as valid: whether the field is required is the form's call,
 *  not this function's. */
export function isValidEmail(value) {
  const email = (value || "").trim().toLowerCase();
  if (!email) return true;
  if (!EMAIL_SHAPE.test(email)) return false;
  return EMAIL_DOMAINS.includes(email.split("@").pop());
}

/** Names the acceptable domains rather than saying "invalid": somebody typing
 *  a Yahoo address has not made a mistake they can see. */
export const EMAIL_ERROR = `Email must be a ${EMAIL_DOMAINS.map((d) => `@${d}`).join(
  " or "
)} address.`;

/** The hint shown under an email field, before anything is wrong. */
export const EMAIL_HINT = EMAIL_DOMAINS.map((d) => `@${d}`).join(" or ");
