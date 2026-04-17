/**
 * Voting Pattern Narration — gpt-4o-mini wrapper
 *
 * Takes a list of 12 pre-ranked notable votes and returns one-sentence
 * narrations per vote. The LLM never judges; it only describes what the
 * deterministic stats already show. A forbidden-word filter catches
 * politically-loaded phrasing; retries once; falls back to a deterministic
 * template if the model keeps returning forbidden language or the API fails.
 */

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
  const dir = matched ? 'aligned' : 'diverged'
  const ref = partyDirection === 1 ? 'the party majority (Yea)' : 'the party majority (Nay)'
  return `Voted ${pos} on ${title} — ${dir} with ${ref}.`
}

/**
 * Request the LLM to narrate the full set of 12 votes. One call total.
 * Returns an array of { billTitle, narration } objects in input order,
 * or null on any API or parse failure.
 */
async function requestNarrations(items, apiKey) {
  const systemPrompt = [
    'You are a neutral civic journalist describing how a U.S. senator or representative voted.',
    'For each vote I send, write ONE sentence under 25 words.',
    'Rules:',
    '- Describe what the rep did and cite at least one number (vote margin, percentage, or count).',
    '- Do NOT speculate about motive.',
    '- Do NOT use these words: bias, biased, anti-American, corruption, influence-peddling.',
    '- Match the register of a newspaper beat reporter, not a pundit.',
    'Return ONLY valid JSON of the shape:',
    '{ "narrations": [ { "billTitle": "...", "narration": "..." } ] }',
    'Return narrations in the same order as the input votes.',
  ].join('\n')

  const userPrompt = JSON.stringify({ votes: items })

  let response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    })
  } catch (err) {
    console.warn('[VPA Narration] Network error:', err.message)
    return null
  }

  if (!response.ok) {
    console.warn('[VPA Narration] API error:', response.status)
    return null
  }

  let body
  try {
    body = await response.json()
    const content = body?.choices?.[0]?.message?.content
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed.narrations)) return null
    return parsed.narrations
  } catch (err) {
    console.warn('[VPA Narration] JSON parse error:', err.message)
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

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) {
    return {
      narrations: annotated.map(a => templateNarration(a.vote, a.matched, a.pDir)),
      degraded: true,
    }
  }

  // Prepare minimal per-vote context for the LLM.
  const items = annotated.map(a => ({
    billTitle: a.vote.bill?.title ?? 'Unlabeled measure',
    position: a.vote.position,
    matchedPartyMajority: a.matched,
    partyMajorityDirection: a.pDir === 1 ? 'Yea' : a.pDir === 0 ? 'Nay' : 'unknown',
    policyArea: a.vote.bill?.policy_area ?? null,
    voteMargin: a.margin === Number.POSITIVE_INFINITY ? null : a.margin,
  }))

  let narrations = await requestNarrations(items, apiKey)

  if (Array.isArray(narrations) && narrations.length === items.length) {
    // Forbidden-word check on narration field only (NOT billTitle).
    const hasForbidden = narrations.some(n => n && FORBIDDEN.test(n.narration || ''))
    if (hasForbidden) {
      const retry = await requestNarrations(items, apiKey)
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
