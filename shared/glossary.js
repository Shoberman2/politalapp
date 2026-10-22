// Plain-English definitions for the words Congress uses, written for someone
// with no political or government background. One list for the whole site:
// the ⓘ next to a term (src/components/Term.jsx), the /glossary page, and the
// iOS app's copy (ios/BallotWatch/Resources/glossary.json, regenerated with
// `node scripts/sync-glossary.mjs`) all read it.
//
// Rules for a definition: one or two short sentences, everyday words, no other
// jargon unless it has its own entry, and no opinion about whether something is
// good or bad. `group` sorts the /glossary page.

export const GLOSSARY_GROUPS = [
  { id: 'basics', title: 'The basics' },
  { id: 'people', title: 'The people' },
  { id: 'bills', title: 'Bills and laws' },
  { id: 'votes', title: 'Votes' },
  { id: 'procedure', title: 'How the floor works' },
  { id: 'money', title: 'Money and budgets' },
]

export const GLOSSARY = {
  // The basics
  congress: {
    term: 'Congress',
    group: 'basics',
    def: 'The part of the U.S. government that writes and passes federal laws. It has two halves, the House and the Senate, and a law has to pass both.',
  },
  house: {
    term: 'House of Representatives',
    group: 'basics',
    def: 'The larger half of Congress: 435 voting members, each elected by one district for a two-year term. States with more people get more seats.',
  },
  senate: {
    term: 'Senate',
    group: 'basics',
    def: 'The smaller half of Congress: 100 members, two from every state no matter its size, each elected for a six-year term.',
  },
  chamber: {
    term: 'Chamber',
    group: 'basics',
    def: 'Either half of Congress: the House or the Senate.',
  },
  congressNumber: {
    term: '119th Congress',
    group: 'basics',
    def: 'Congress is numbered in two-year stretches that start after each national election. The 119th Congress runs from January 2025 to January 2027.',
  },
  session: {
    term: 'Session',
    group: 'basics',
    def: 'Each two-year Congress is split into two yearly sessions. Session 1 is the first year, session 2 the second.',
  },
  district: {
    term: 'Congressional district',
    group: 'basics',
    def: 'The area a House member represents. Each state is divided into districts of roughly equal population, and you live in exactly one.',
  },
  atLarge: {
    term: 'At-large',
    group: 'basics',
    def: 'A state with so few people that it gets only one House seat. That one member represents the whole state.',
  },
  floor: {
    term: 'The floor',
    group: 'basics',
    def: 'The main room where the whole House or the whole Senate meets to debate and vote. A bill "reaches the floor" when everyone gets to vote on it.',
  },
  committee: {
    term: 'Committee',
    group: 'basics',
    def: 'A small group of members who focus on one topic, like farming or the military. Most bills go to a committee first, and many never leave it.',
  },

  // The people
  representative: {
    term: 'Representative',
    group: 'people',
    def: 'A member of the House. Each one is elected by the voters of one district. Also called a congressman or congresswoman.',
  },
  senator: {
    term: 'Senator',
    group: 'people',
    def: 'A member of the Senate. Every state elects two, and both represent the whole state.',
  },
  delegate: {
    term: 'Delegate',
    group: 'people',
    def: 'A House member from Washington, D.C. or a U.S. territory such as Puerto Rico or Guam. They can speak and write bills but cannot vote on final passage.',
  },
  party: {
    term: 'Party',
    group: 'people',
    def: 'The political group a member belongs to. D means Democrat, R means Republican, and I means Independent (not in either major party).',
  },
  independent: {
    term: 'Independent',
    group: 'people',
    def: 'A member who does not belong to the Democratic or Republican party. Most still choose one of the two parties to work with.',
  },
  majority: {
    term: 'Majority and minority',
    group: 'people',
    def: 'The party with more seats in a chamber is the majority. It chooses the leaders and decides which bills get a vote. The other party is the minority.',
  },
  speaker: {
    term: 'Speaker of the House',
    group: 'people',
    def: 'The leader of the House, elected by its members. The Speaker largely decides which bills come up for a vote.',
  },
  leadership: {
    term: 'Leadership',
    group: 'people',
    def: 'The members each party picks to run its side of a chamber, such as the Speaker, the majority and minority leaders, and the whips who count votes.',
  },
  sponsor: {
    term: 'Sponsor',
    group: 'people',
    def: 'The member who officially introduces a bill. Only a member of Congress can introduce one.',
  },
  cosponsor: {
    term: 'Cosponsor',
    group: 'people',
    def: 'A member who signs on to support someone else\'s bill. More cosponsors usually means more support, but it does not guarantee a vote.',
  },
  bioguide: {
    term: 'Bioguide ID',
    group: 'people',
    def: 'The official ID Congress gives every member, past and present, like S000148. We use it to link to their official records.',
  },

  // Bills and laws
  bill: {
    term: 'Bill',
    group: 'bills',
    def: 'A proposed law. It becomes law only if both the House and the Senate pass the same text and the President signs it (or Congress overrides a veto).',
  },
  billNumber: {
    term: 'Bill number',
    group: 'bills',
    def: 'Each bill gets a label from where it started. H.R. 1234 started in the House; S. 56 started in the Senate. Res. means a resolution.',
  },
  resolution: {
    term: 'Resolution',
    group: 'bills',
    def: 'A measure that usually states an opinion or sets a chamber\'s own rules, like honoring someone or setting debate rules. Most do not become law. A joint resolution (J.Res.) can, just like a bill.',
  },
  amendment: {
    term: 'Amendment',
    group: 'bills',
    def: 'A proposed change to a bill\'s text. Members vote on amendments before they vote on the bill itself.',
  },
  introduced: {
    term: 'Introduced',
    group: 'bills',
    def: 'The first step: a member formally files the bill. Thousands are introduced every Congress; only a few percent become law.',
  },
  referred: {
    term: 'Referred to committee',
    group: 'bills',
    def: 'The bill has been sent to a committee to study. Most bills stop here and never get a vote.',
  },
  reported: {
    term: 'Reported',
    group: 'bills',
    def: 'A committee has finished with the bill and sent it back to the full chamber, usually recommending it pass.',
  },
  passed: {
    term: 'Passed',
    group: 'bills',
    def: 'One chamber voted to approve the bill. It still has to pass the other chamber and be signed before it becomes law.',
  },
  enacted: {
    term: 'Became law',
    group: 'bills',
    def: 'Both chambers passed the bill and the President signed it, or Congress overrode a veto. It is now federal law. Also called enacted.',
  },
  veto: {
    term: 'Veto',
    group: 'bills',
    def: 'The President\'s refusal to sign a bill. Congress can still make it law if two-thirds of both the House and the Senate vote to override.',
  },
  officialSummary: {
    term: 'Official summary',
    group: 'bills',
    def: 'A neutral description of a bill written by the Congressional Research Service, a nonpartisan office that works for Congress. We show it next to our own plain-English explanation.',
  },
  plainEnglish: {
    term: 'Plain-English explanation',
    group: 'bills',
    def: 'A short explanation of what a bill would change and who it affects, written with AI from the bill’s own official text and always labeled as AI. Nothing is guessed from the title, and the text is one click away.',
  },
  policyArea: {
    term: 'Policy area',
    group: 'bills',
    def: 'The main topic Congress files a bill under, such as Health or Taxation, so related bills can be found together.',
  },
  latestAction: {
    term: 'Latest action',
    group: 'bills',
    def: 'The most recent official step taken on a bill, such as a committee hearing or a vote.',
  },

  // Votes
  rollCall: {
    term: 'Roll call vote',
    group: 'votes',
    def: 'A vote where every member\'s answer is written down by name, so you can see exactly how each one voted. Each gets a number, like Roll 295.',
  },
  yea: {
    term: 'Yea',
    group: 'votes',
    def: 'A yes vote. Some votes record it as "Aye."',
  },
  nay: {
    term: 'Nay',
    group: 'votes',
    def: 'A no vote. Some votes record it as "No."',
  },
  present: {
    term: 'Present',
    group: 'votes',
    def: 'The member was there but chose not to vote yes or no, often because of a conflict of interest or as a protest.',
  },
  notVoting: {
    term: 'Not voting',
    group: 'votes',
    def: 'The member did not vote at all, usually because they were absent that day.',
  },
  missedVotes: {
    term: 'Missed votes',
    group: 'votes',
    def: 'How many roll call votes a member did not vote in. Illness, family leave, or campaigning can all cause missed votes.',
  },
  voteResult: {
    term: 'Vote result',
    group: 'votes',
    def: 'Whether the question being voted on won or lost. "Passed" and "Agreed to" mean it won; "Failed" and "Rejected" mean it lost.',
  },
  partySplit: {
    term: 'Party split',
    group: 'votes',
    def: 'How each party\'s members voted on one question, for example how many Democrats voted yes and how many voted no.',
  },
  voteWithParty: {
    term: 'Votes with party',
    group: 'votes',
    def: 'How often a member voted the same way as most of their own party. It is a description, not a grade.',
  },
  voiceVote: {
    term: 'Voice vote',
    group: 'votes',
    def: 'Members call out "aye" or "no" together and the presiding officer judges which side was louder. No names are recorded, so there is no individual record.',
  },
  question: {
    term: 'Question',
    group: 'votes',
    def: 'What a vote decides. A bill can get several votes, such as one to start debate, one on a change, and one to pass it, each a separate question.',
  },

  // How the floor works
  filibuster: {
    term: 'Filibuster',
    group: 'procedure',
    def: 'In the Senate, debate can go on until 60 senators vote to end it. Using that rule to delay or block a vote is called a filibuster.',
  },
  cloture: {
    term: 'Cloture',
    group: 'procedure',
    def: 'A Senate vote to end debate so the Senate can move to a final vote. It usually needs 60 of 100 votes, which is why many bills need 60 senators, not 51.',
  },
  motionToProceed: {
    term: 'Motion to proceed',
    group: 'procedure',
    def: 'A Senate vote on whether to start debating a bill at all. Passing it does not pass the bill.',
  },
  suspension: {
    term: 'Suspension of the rules',
    group: 'procedure',
    def: 'A House shortcut for bills with wide support: debate is short, no changes are allowed, and the bill needs two-thirds of the votes instead of a simple majority.',
  },
  motionToRecommit: {
    term: 'Motion to recommit',
    group: 'procedure',
    def: 'A last-minute House vote, usually offered by the minority party, to send a bill back to committee instead of passing it.',
  },
  motionToTable: {
    term: 'Motion to table',
    group: 'procedure',
    def: 'A vote to set something aside without voting on it directly. Tabling usually ends it for good.',
  },
  rule: {
    term: 'Rule',
    group: 'procedure',
    def: 'In the House, a resolution that sets the terms of debate for a bill: how long, and which changes may be offered. The House votes on the rule before the bill.',
  },
  unanimousConsent: {
    term: 'Unanimous consent',
    group: 'procedure',
    def: 'A way to act without a recorded vote: if no member present objects, the request is approved.',
  },
  quorum: {
    term: 'Quorum',
    group: 'procedure',
    def: 'The minimum number of members who must be present to do business: more than half of the chamber.',
  },
  nomination: {
    term: 'Nomination',
    group: 'procedure',
    def: 'A person the President picks for a job such as judge, ambassador, or cabinet secretary. The Senate votes to confirm or reject them; the House does not.',
  },
  majorityVote: {
    term: 'Simple majority',
    group: 'procedure',
    def: 'More yes votes than no votes among the members who vote. Most questions need only this; some need two-thirds or 60 votes.',
  },

  // Money and budgets
  campaignFinance: {
    term: 'Campaign finance',
    group: 'money',
    def: 'The money raised and spent to run for office. Candidates must report it to the Federal Election Commission, and those reports are public.',
  },
  fec: {
    term: 'FEC',
    group: 'money',
    def: 'The Federal Election Commission, the government agency that collects and publishes candidates\' fundraising and spending reports.',
  },
  pac: {
    term: 'PAC',
    group: 'money',
    def: 'A political action committee: a group that pools money from many people to give to candidates. Companies, unions, and causes often run one.',
  },
  appropriations: {
    term: 'Appropriations',
    group: 'money',
    def: 'The yearly spending bills that give federal agencies their money. If they are not passed in time, parts of the government can shut down.',
  },
  fiscalYear: {
    term: 'Fiscal year',
    group: 'money',
    def: 'The government\'s budget year, which runs from October 1 to September 30 and is named for the year it ends in: FY2027 runs from October 1, 2026 to September 30, 2027.',
  },
  continuingResolution: {
    term: 'Continuing resolution',
    group: 'money',
    def: 'A short-term bill that keeps the government funded at last year\'s levels while Congress keeps working on the full budget. Often called a CR.',
  },
  shutdown: {
    term: 'Government shutdown',
    group: 'money',
    def: 'What happens when funding runs out: agencies without money stop non-essential work, and many federal workers are sent home or work without pay until Congress acts.',
  },
}

export const GLOSSARY_IDS = Object.keys(GLOSSARY)

export function glossaryEntry(id) {
  return GLOSSARY[id] || null
}

// The glossary entry a vote question points at, so a roll call's "On Cloture
// on the Motion to Proceed" gets the ⓘ for cloture. Checked in order; the first
// match wins. Returns an id or null.
const QUESTION_TERMS = [
  [/cloture/i, 'cloture'],
  [/suspend the rules/i, 'suspension'],
  [/recommit/i, 'motionToRecommit'],
  [/motion to table/i, 'motionToTable'],
  [/motion to proceed/i, 'motionToProceed'],
  [/nomination|confirmation/i, 'nomination'],
  [/quorum/i, 'quorum'],
  [/veto/i, 'veto'],
  [/amendment/i, 'amendment'],
  [/providing for consideration|\brule\b/i, 'rule'],
]

export function termForQuestion(question) {
  if (!question) return null
  for (const [re, id] of QUESTION_TERMS) if (re.test(question)) return id
  return null
}
