/**
 * Filter members by a search query that matches against first name,
 * last name, and full name parts. Word order does not matter.
 *
 * Each search word must match the start of at least one name part.
 * e.g., "Sand Ber" matches "Sanders, Bernard" because "sand" prefixes
 * "sanders" and "ber" prefixes "bernard".
 */
export function filterMembersByName(members, searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return members

  const searchWords = searchTerm.toLowerCase().trim().split(/[\s,]+/).filter(Boolean)

  return members.filter(member => {
    const firstName = (member.firstName || member.first_name || '').toLowerCase()
    const lastName = (member.lastName || member.last_name || '').toLowerCase()
    const fullName = (member.name || '').toLowerCase()

    const nameParts = [
      firstName,
      lastName,
      ...fullName.split(/[\s,]+/).filter(Boolean),
    ]

    return searchWords.every(word =>
      nameParts.some(part => part.startsWith(word))
    )
  })
}
