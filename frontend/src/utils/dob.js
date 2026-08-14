/**
 * Whole years as of today, or null if `dob` (YYYY-MM-DD) is empty/invalid.
 * Mirrors the backend's `Patient.age` property so a form's live preview
 * always matches what the record will show once saved.
 */
export function calculateAge(dob) {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const beforeBirthday =
    today.getMonth() < parsed.getMonth() ||
    (today.getMonth() === parsed.getMonth() && today.getDate() < parsed.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * An approximate date of birth (YYYY-MM-DD) for a patient who only knows
 * their age, not their birth date — today's month and day, `age` years back.
 * `calculateAge` on the result reads back exactly `age` until next year's
 * anniversary of registration, when it advances by one, the same way a real
 * birthday would.
 */
export function dobFromAge(age) {
  const years = Number(age);
  if (!Number.isFinite(years) || years < 0) return "";
  const today = new Date();
  const year = today.getFullYear() - Math.floor(years);
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
