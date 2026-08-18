/**
 * A doctor's name with the title on the front, exactly once.
 *
 * The name column holds whatever the practice typed, and practices type the
 * title into it — this one's doctor is stored as "Dr.Ramana". Prefixing that
 * gives "Dr. Dr.Ramana", which is how the patient portal first rendered every
 * appointment card. Prefixing *nothing* is not the fix either: a doctor stored
 * as plain "Ramana" then reads as a patient's name on the patient's own screen.
 *
 * So the title is added only when it is not already there, and the check is
 * deliberately loose about the space — "Dr.Ramana", "Dr Ramana" and
 * "DR. Ramana" are all the same person having already been given their title.
 */
const HAS_TITLE = /^\s*(dr|doctor)\b\.?/i;

export function doctorName(name, { fallback = null } = {}) {
  const value = (name || "").trim();
  if (!value) return fallback;
  return HAS_TITLE.test(value) ? value : `Dr. ${value}`;
}

export default doctorName;
