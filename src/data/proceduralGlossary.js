/**
 * Shared civics glossary for congressional terminology.
 *
 * Each entry has:
 *   - definition: plain-English explanation a citizen can understand
 *   - category:   one of 'procedural' | 'substantive' | 'role' | 'process'
 *
 *   procedural   — parliamentary actions on how the chamber operates
 *                  (cloture, motion to recommit, motion to table, etc.)
 *   substantive  — actions on the content of legislation
 *                  (passed house, vetoed, signed by president)
 *   role         — types of people involved (sponsor, cosponsor)
 *   process      — generic legislative process terms
 *                  (committee, markup, conference, amendment)
 *
 * Used by:
 *   - VoteDashboard.jsx procedural vote cards (annotates question text)
 *   - VotingHistory.jsx legislative-activity cards (annotates latestAction.text)
 *   - any future surface that renders congressional jargon
 *
 * Single source of truth — extracted from VotingHistory.jsx GLOSSARY const
 * and extended with ~30 procedural-specific terms required by the
 * "Explain Procedural Votes" feature.
 *
 * Keys are lowercase. The annotateText() consumer matches case-insensitively.
 */

export const PROCEDURAL_GLOSSARY = {
  // ---------------------------------------------------------------------------
  // Process / generic
  // ---------------------------------------------------------------------------
  'introduced': {
    definition: 'The bill was formally submitted to Congress for the first time. This is the first step in the legislative process — it doesn\'t mean it\'s been debated or voted on yet.',
    category: 'process',
  },
  'referred to': {
    definition: 'The bill was sent to a specific congressional committee for review. Committees study bills in detail before deciding whether to send them to the full chamber for a vote.',
    category: 'process',
  },
  'committee': {
    definition: 'A small group of members of Congress assigned to focus on a specific topic (like finance, defense, or education). Most bills are reviewed by a committee before the full House or Senate votes.',
    category: 'process',
  },
  'markup': {
    definition: 'When a committee meets to debate, amend, and rewrite a bill before sending it to the full chamber. This is where major changes often happen.',
    category: 'process',
  },
  'conference': {
    definition: 'When the House and Senate pass different versions of the same bill, a conference committee of members from both chambers works out a compromise version.',
    category: 'process',
  },
  'conference report': {
    definition: 'The final compromise version of a bill written by a House-Senate conference committee. Both chambers must vote on it (no further amendments allowed) before it goes to the President.',
    category: 'process',
  },

  // ---------------------------------------------------------------------------
  // Substantive (passage / outcomes)
  // ---------------------------------------------------------------------------
  'passed house': {
    definition: 'The bill received a majority vote in the House of Representatives (at least 218 of 435 members). It still needs to pass the Senate and be signed by the President to become law.',
    category: 'substantive',
  },
  'passed senate': {
    definition: 'The bill received a majority vote in the Senate (at least 51 of 100 senators). It still needs to pass the House (if it hasn\'t) and be signed by the President.',
    category: 'substantive',
  },
  'enrolled': {
    definition: 'The final, official copy of the bill that passed both the House and Senate. This version is sent to the President for signature.',
    category: 'substantive',
  },
  'engrossed': {
    definition: 'The official version of a bill as passed by one chamber (House or Senate). It\'s prepared in final form before being sent to the other chamber.',
    category: 'substantive',
  },
  'signed by president': {
    definition: 'The President approved the bill by signing it. It is now law.',
    category: 'substantive',
  },
  'became public law': {
    definition: 'The bill has completed the entire legislative process and is now an official law of the United States.',
    category: 'substantive',
  },
  'vetoed': {
    definition: 'The President rejected the bill. Congress can override a veto with a two-thirds vote in both chambers, but this is rare.',
    category: 'substantive',
  },
  'override': {
    definition: 'When Congress passes a bill the President vetoed, requiring a two-thirds majority in both the House and Senate. Used rarely but signals strong cross-party agreement.',
    category: 'substantive',
  },
  'on passage': {
    definition: 'A vote on whether to pass a bill in its current form. This is the substantive vote on the content of the legislation.',
    category: 'substantive',
  },
  'final passage': {
    definition: 'The last vote on a bill before it leaves the chamber. After final passage, the bill moves to the other chamber or to the President.',
    category: 'substantive',
  },

  // ---------------------------------------------------------------------------
  // Procedural (parliamentary motions and tactics)
  // ---------------------------------------------------------------------------
  'cloture': {
    definition: 'A Senate procedure to end debate (filibuster) on a bill. It requires 60 out of 100 senators to agree. Without cloture, a single senator can block a vote indefinitely.',
    category: 'procedural',
  },
  'filibuster': {
    definition: 'A Senate tactic of delaying or blocking a vote by extending debate. To overcome it, supporters need 60 senators to vote for cloture (ending debate).',
    category: 'procedural',
  },
  'tabled': {
    definition: 'The bill was set aside and is unlikely to be voted on. This is often a way to quietly kill a bill without a direct vote.',
    category: 'procedural',
  },
  'motion to table': {
    definition: 'A motion to set aside an item indefinitely. If the motion succeeds, the underlying matter (often an amendment or bill) is killed without a direct vote on it.',
    category: 'procedural',
  },
  'motion to recommit': {
    definition: 'A motion to send a bill back to committee, often with instructions to make specific changes. In the House, this is the minority party\'s last chance to amend or delay a bill before final passage.',
    category: 'procedural',
  },
  'recommit': {
    definition: 'Sending a bill back to a committee, usually with instructions to amend it. Often used as a tactic to delay or modify a bill before final passage.',
    category: 'procedural',
  },
  'motion to suspend': {
    definition: 'A House procedure to fast-track a bill by suspending the normal rules. Requires a two-thirds majority but limits debate and prohibits amendments.',
    category: 'procedural',
  },
  'motion to suspend the rules': {
    definition: 'A House procedure to bypass normal rules for fast-track passage. Requires two-thirds majority. Often used for non-controversial bills or in tight time windows.',
    category: 'procedural',
  },
  'motion to proceed': {
    definition: 'A Senate motion to begin formal consideration of a bill. The motion to proceed itself can be filibustered, requiring 60 votes for cloture before debate even starts.',
    category: 'procedural',
  },
  'motion to commit': {
    definition: 'A motion to send a bill to a committee for further review, often used to add specific instructions or to delay a vote.',
    category: 'procedural',
  },
  'motion to discharge': {
    definition: 'A motion to force a bill out of a committee that has been holding it without action, bringing it to the full chamber for a vote.',
    category: 'procedural',
  },
  'discharged': {
    definition: 'A bill was forced out of committee and brought to the full chamber for a vote, bypassing the normal committee process. This is rare and usually signals strong support.',
    category: 'procedural',
  },
  'previous question': {
    definition: 'A House motion that ends debate and forces an immediate vote. The majority typically uses it to control the floor and prevent further amendments.',
    category: 'procedural',
  },
  'point of order': {
    definition: 'An objection raised that a motion or vote violates the chamber\'s rules. The presiding officer rules on it, sometimes after a brief debate.',
    category: 'procedural',
  },
  'approve the journal': {
    definition: 'A routine vote to formally accept the previous day\'s record of proceedings. Almost always passes; serves as an attendance check.',
    category: 'procedural',
  },
  'quorum call': {
    definition: 'A check to see if enough members are present (a quorum) to do business. Often used to delay proceedings.',
    category: 'procedural',
  },

  // ---------------------------------------------------------------------------
  // Amendments and bill modification
  // ---------------------------------------------------------------------------
  'amendment': {
    definition: 'A proposed change to a bill. Amendments are debated and voted on during the legislative process.',
    category: 'process',
  },
  'amendment in the nature of a substitute': {
    definition: 'An amendment that replaces the entire text of a bill with new language. Often used to make major rewrites without introducing a new bill.',
    category: 'process',
  },
  'striking amendment': {
    definition: 'An amendment that removes a section or specific text from a bill, sometimes replacing it with new language.',
    category: 'process',
  },

  // ---------------------------------------------------------------------------
  // Roles and sponsorship
  // ---------------------------------------------------------------------------
  'cosponsor': {
    definition: 'A member of Congress who formally supports a bill introduced by someone else. Having many cosponsors signals broad support.',
    category: 'role',
  },
  'sponsor': {
    definition: 'The member of Congress who originally wrote and introduced the bill. Each bill has one primary sponsor.',
    category: 'role',
  },

  // ---------------------------------------------------------------------------
  // Bill types
  // ---------------------------------------------------------------------------
  'resolution': {
    definition: 'A formal statement by one or both chambers of Congress. Some resolutions have the force of law (joint resolutions), while others just express opinions.',
    category: 'process',
  },
  'joint resolution': {
    definition: 'A formal action requiring approval from both chambers and the President. Has the force of law, similar to a regular bill. Often used for narrow purposes like declaring war.',
    category: 'process',
  },
  'concurrent resolution': {
    definition: 'A resolution passed by both chambers but not signed by the President. Used for internal matters like setting the budget framework. Does not have the force of law.',
    category: 'process',
  },
  'simple resolution': {
    definition: 'A resolution adopted by only one chamber, on matters internal to that chamber. Does not require Senate or Presidential action.',
    category: 'process',
  },
  'appropriations': {
    definition: 'Bills that authorize the government to spend money. These are essential for funding federal programs and agencies.',
    category: 'process',
  },
  'continuing resolution': {
    definition: 'A short-term funding bill that keeps the government operating at current spending levels when full appropriations bills haven\'t passed. Often used to avoid a shutdown.',
    category: 'process',
  },
  'reconciliation': {
    definition: 'A special Senate process for fast-tracking budget-related bills. Avoids the filibuster — only 51 votes needed instead of 60. Used for major tax or spending legislation.',
    category: 'process',
  },
};

/**
 * Returns a flat lookup of `term -> definition string`, preserving the original
 * shape consumed by VotingHistory.jsx's annotateText() (which expects a flat
 * `Object.entries(GLOSSARY)` of [term, definition] pairs).
 *
 * Provided as a convenience so existing callers don't have to change.
 */
export const GLOSSARY_FLAT = Object.fromEntries(
  Object.entries(PROCEDURAL_GLOSSARY).map(([term, entry]) => [term, entry.definition])
);
