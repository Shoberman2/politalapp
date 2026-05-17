/**
 * Politician name matcher — shared by AllPoliticians and the
 * BillsPage sponsor filter pill autocomplete.
 *
 * Extracted from src/utils/searchFilter.js to consolidate the matching
 * logic in one place. Behavior preserved: each search word must prefix
 * at least one name part (first name, last name, or any whitespace-split
 * token of the full "Last, First" name string). Word order does not matter.
 *
 * Examples (regression test fixtures):
 *   "Sand Ber"  → matches "Sanders, Bernard"
 *   "Eliz War"  → matches "Warren, Elizabeth"
 *   "ber sand"  → matches "Sanders, Bernard" (order-independent)
 *   ""          → returns input unchanged (no filter)
 *   "xyz"       → returns []
 *
 * Each politician object should expose at least one of:
 *   { firstName, lastName, name }    (Congress.gov shape)
 *   { first_name, last_name, name }  (Supabase shape)
 */

function nameParts(politician) {
  const firstName = (politician?.firstName || politician?.first_name || '').toLowerCase();
  const lastName = (politician?.lastName || politician?.last_name || '').toLowerCase();
  const fullName = (politician?.name || '').toLowerCase();
  return [
    firstName,
    lastName,
    ...fullName.split(/[\s,]+/).filter(Boolean),
  ];
}

/**
 * Does the politician match the search term?
 * Returns true on empty/whitespace search (no filter applied).
 */
export function politicianMatches(politician, searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return true;
  const words = searchTerm.toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return true;
  const parts = nameParts(politician);
  return words.every(word => parts.some(part => part.startsWith(word)));
}

/**
 * Filter an array of politicians by search term.
 * Preserves input order on match.
 */
export function filterPoliticians(politicians, searchTerm) {
  if (!Array.isArray(politicians) || politicians.length === 0) return [];
  if (!searchTerm || !searchTerm.trim()) return politicians;
  return politicians.filter(p => politicianMatches(p, searchTerm));
}

/**
 * Limit + filter wrapper for the autocomplete dropdown — returns the
 * first `limit` matches. Politicians table is N=540, so the full scan
 * is sub-ms; the limit is a UX cap, not a performance one.
 */
export function autocompletePoliticians(politicians, searchTerm, limit = 50) {
  const matches = filterPoliticians(politicians, searchTerm);
  return matches.slice(0, limit);
}
