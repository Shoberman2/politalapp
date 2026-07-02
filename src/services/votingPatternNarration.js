/**
 * Voting Pattern Narration
 *
 * Takes a list of 12 pre-ranked notable votes and returns one-sentence
 * narrations per vote. The LLM never judges; it only describes what the
 * deterministic stats already show. A forbidden-word filter catches
 * politically-loaded phrasing; retries once; falls back to a deterministic
 * template if the model keeps returning forbidden language or the API fails.
 *
 * The OpenAI call lives in the `narrate-votes` Supabase Edge Function so
 * the API key never enters the browser bundle.
 */

import { supabase } from '../lib/supabase'

// Forbidden in LLM-added clauses (but not in quoted bill titles).
const FORBIDDEN = /\b(bias(ed)?|anti-american|corrupt(ion)?|influence[- ]peddling)\b/i

/**
 * Build a deterministic template sentence for one vote. Used as fallback
 * when the LLM fails OR repeatedly returns forbidden language.
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
 * Invoke the Edge Function. Returns the narrations array on success,
 * or null on any error (so the caller can decide whether to retry or fall back).
 */
async function requestNarrations(items) {
  try {
    const { data, error } = await supabase.functions.invoke('narrate-votes', {
      body: { items },
    })
    if (error) {
      console.warn('[VPA Narration] Edge function error:', error.message)
      return null
    }
    if (!data || !Array.isArray(data.narrations)) {
      console.warn('[VPA Narration] Unexpected response shape')
      return null
    }
    return data.narrations
  } catch (err) {
    console.warn('[VPA Narration] Network error:', err.message)
    return null
  }
}

/**
 * Narrate a list of ranked votes. Returns parallel array of strings.
 *
 * @param {Array} annotated - per-vote metadata [{vote, matched, pDir}]
 * @returns {Promise<{narrations: string[], degraded: boolean}>}
 */
export async function narrateVotes(annotated) {
  if (!annotated?.length) return { narrations: [], degraded: false }

  // Prepare minimal per-vote context for the LLM.
  const items = annotated.map(a => ({
    billTitle: a.vote.bill?.title ?? 'Unlabeled measure',
    position: a.vote.position,
    matchedPartyMajority: a.matched,
    partyMajorityDirection: a.pDir === 1 ? 'Yea' : a.pDir === 0 ? 'Nay' : 'unknown',
    policyArea: a.vote.bill?.policy_area ?? null,
    voteMargin: a.margin === Number.POSITIVE_INFINITY ? null : a.margin,
  }))

  let narrations = await requestNarrations(items)

  if (Array.isArray(narrations) && narrations.length === items.length) {
    // Forbidden-word check on narration field only (NOT billTitle).
    const hasForbidden = narrations.some(n => n && FORBIDDEN.test(n.narration || ''))
    if (hasForbidden) {
      const retry = await requestNarrations(items)
      if (Array.isArray(retry) && retry.length === items.length) {
        narrations = retry
      }
    }
  }

  if (!Array.isArray(narrations) || narrations.length !== items.length) {
    // Full degraded mode: template for every vote.
    return {
      narrations: annotated.map(a => templateNarration(a.vote, a.matched, a.pDir)),
      degraded: true,
    }
  }

  // Per-sentence forbidden-word fallback after retry.
  const out = narrations.map((n, i) => {
    const text = n?.narration ?? ''
    if (!text || FORBIDDEN.test(text)) {
      return templateNarration(annotated[i].vote, annotated[i].matched, annotated[i].pDir)
    }
    return text
  })

  return { narrations: out, degraded: false }
}

// Exposed for unit testing.
export const __internal = { FORBIDDEN, templateNarration }
