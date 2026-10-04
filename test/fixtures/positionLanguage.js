// Words that would describe the person's stance or judge the member against
// it. "You wrote; they voted" never stores or infers a position, so none of
// its copy may use them.
export const POSITION_RE = /\b(against|for you|your position|your view|support\w*|oppos\w*|agree\w*|disagree\w*|sided|broke|kept|betray\w*|ignored|listened|promise\w*|stance|despite|finally)\b/i
