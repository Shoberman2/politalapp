/**
 * Voting Pattern Narration
 *
 * Takes pre-ranked notable votes and returns one-sentence, record-based
 * narrations. The wording is deterministic because every relevant fact is
 * already present in the recorded vote data; analysis must not depend on an
 * external model account or introduce model-authored interpretation.
 */

/**
 * Build a deterministic sentence from recorded vote fields.
 */
function templateNarration(vote, matched, partyDirection) {
  const pos = vote.position === 'Yea' || vote.position === 'Yes' ? 'YES' : 'NO'
  const title = vote.bill?.title ?? 'an unlabeled measure'
  if (matched === null) {
    return `Voted ${pos} on ${title}.`
  }
  const dir = matched ? 'matched' : 'differed from'
  const ref = partyDirection === 1 ? 'the party majority (Yea)' : 'the party majority (Nay)'
  return `Voted ${pos} on ${title} — ${dir} ${ref}.`
}

/**
 * Narrate a list of ranked votes. Returns parallel array of strings.
 *
 * @param {Array} annotated - per-vote metadata [{vote, matched, pDir}]
 * @returns {Promise<{narrations: string[], degraded: boolean}>}
 */
export async function narrateVotes(annotated) {
  if (!annotated?.length) return { narrations: [], degraded: false }
  return {
    narrations: annotated.map(a => templateNarration(a.vote, a.matched, a.pDir)),
    degraded: false,
  }
}

// Exposed for unit testing.
export const __internal = { templateNarration }
