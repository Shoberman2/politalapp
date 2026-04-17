/**
 * Caucus overrides for independent members of Congress.
 *
 * For the Voting Pattern Analysis classifier: independents caucusing with a
 * party are treated as members of that party when computing party-majority
 * direction and crossover rate.
 *
 * MUST MATCH `INDEPENDENT_CAUCUS` in etl/computeStats.ts. If you add or remove
 * an entry here, update the ETL file too. The `caucusOverrides.test.js`
 * regression test catches entries in the database not covered by this map,
 * but it cannot detect map drift between frontend and ETL.
 *
 * Keys are Congress.gov bioguide IDs. Values are 'D' or 'R'.
 */
export const CAUCUS_OVERRIDES = {
  S000033: 'D', // Bernie Sanders (I-VT) caucuses with Democrats
  K000383: 'D', // Angus King (I-ME) caucuses with Democrats
};

/**
 * Return the party a politician effectively votes with.
 * For independents with a caucus override, returns the caucus party.
 * For everyone else, returns the raw party (D, R, or I).
 */
export function effectiveParty(bioguideId, rawParty) {
  if (CAUCUS_OVERRIDES[bioguideId]) return CAUCUS_OVERRIDES[bioguideId];
  return rawParty;
}
