// Party as one letter. The data spells it several ways ("D", "Democrat",
// "Democratic", "Republican", "Independent"); anything else is null, which
// callers print as "party not listed", never as a vacancy.
export function partyLetter(value) {
  const p = String(value || '').trim().toLowerCase()
  if (p === 'd' || p.startsWith('democrat')) return 'D'
  if (p === 'r' || p.startsWith('republican')) return 'R'
  if (p === 'i' || p.startsWith('independent')) return 'I'
  return null
}

// { D, R, I, unlisted, total } for a list of member_congress_terms rows.
// A caucus override wins over the party the member was elected under.
export function countParties(members = []) {
  const counts = { D: 0, R: 0, I: 0, unlisted: 0, total: 0 }
  for (const m of members) {
    const letter = partyLetter(m.caucus) || partyLetter(m.party)
    if (letter) counts[letter] += 1
    else counts.unlisted += 1
    counts.total += 1
  }
  return counts
}
