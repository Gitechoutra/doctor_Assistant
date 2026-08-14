/**
 * The server's search rule (backend/portal/helpers/search.py), for the few
 * lists that filter rows already in the browser rather than asking the API.
 *
 * Keeping the two in step matters more than the handful of lines it saves: a
 * box that finds "Arjun" on the Patients page and nothing on the queue below
 * it reads as a broken search, not as two different features.
 *
 *   * the query is split into words, and every word must match something, so
 *     "arjun mehta" narrows "arjun" instead of widening it
 *   * one word may match any of the fields offered
 *   * matching is case-insensitive and substring-based, so half a name is
 *     enough and nobody has to reproduce the capital letters
 */

// Same floor as the API, which stops narrowing below it. A single character
// matches most of a list and tells the person searching nothing.
export const MIN_SEARCH_LENGTH = 2;

/** The usable words in a query, lower-cased. `[]` when nothing was typed. */
export function searchTerms(raw) {
  return (raw || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= MIN_SEARCH_LENGTH);
}

/**
 * Does this row match everything that was typed?
 *
 * `fields` is whatever is meaningful for the row — a name, a patient code, a
 * phone number. Nulls are fine and simply match nothing, so a patient with no
 * phone on file is still findable by name.
 *
 * A query with no usable words matches everything: an empty box is not a
 * filter, and one stray character should not empty the list.
 */
export function matchesSearch(raw, fields) {
  const terms = searchTerms(raw);
  if (terms.length === 0) return true;
  const haystack = fields.filter(Boolean).map((f) => String(f).toLowerCase());
  return terms.every((term) => haystack.some((field) => field.includes(term)));
}
