const MIN_VOTES_FOR_LABEL = 25
const DATA_PATH = '/data/voteview-119-members.json'

let datasetPromise

export function classifyNominateScore(score, voteCount = 0) {
  if (!Number.isFinite(score) || voteCount < MIN_VOTES_FOR_LABEL) {
    return {
      available: false,
      label: 'Insufficient voting evidence',
      confidence: 'Insufficient',
      placement: null,
    }
  }

  let label
  if (score <= -0.5) label = 'Progressive-aligned voting record'
  else if (score <= -0.1) label = 'Liberal-aligned voting record'
  else if (score < 0.1) label = 'Cross-partisan voting record'
  else if (score < 0.5) label = 'Conservative-aligned voting record'
  else label = 'Very conservative-aligned voting record'

  const confidence = voteCount >= 200 ? 'High' : voteCount >= 75 ? 'Medium' : 'Limited'

  return {
    available: true,
    label,
    confidence,
    // NOMINATE's modern liberal-conservative dimension runs roughly -1 to +1.
    placement: Math.max(0, Math.min(100, ((score + 1) / 2) * 100)),
  }
}

async function loadDataset() {
  if (!datasetPromise) {
    datasetPromise = fetch(DATA_PATH).then(async (response) => {
      if (!response.ok) throw new Error(`Voteview data unavailable (${response.status})`)
      return response.json()
    })
  }
  return datasetPromise
}

export async function getVotingIdeology(bioguideId) {
  const dataset = await loadDataset()
  const member = dataset.members?.[bioguideId]
  if (!member) {
    return {
      ...classifyNominateScore(null, 0),
      congress: dataset.congress,
      source: dataset.source,
      methodologyUrl: dataset.methodologyUrl,
      fetchedAt: dataset.fetchedAt,
    }
  }

  return {
    ...member,
    ...classifyNominateScore(member.dimension1, member.votes),
    congress: dataset.congress,
    source: dataset.source,
    methodologyUrl: dataset.methodologyUrl,
    fetchedAt: dataset.fetchedAt,
  }
}

export function resetVoteviewCacheForTests() {
  datasetPromise = undefined
}
