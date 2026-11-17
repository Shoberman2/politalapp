// "Congress in one minute": the few facts a first-time visitor needs before
// any vote or bill makes sense. Shared by the landing primer and /glossary.
// Plain text only, no jargon without an ⓘ (`term` names the glossary entry).
// Each fact sits under a real photograph (credits: public/gov/credits.json).

export const CIVICS_PRIMER = [
  {
    title: 'Congress writes the laws.',
    body: 'It has two halves. The House has 435 members, each elected by one district. The Senate has 100, two from every state.',
    term: 'congress',
    image: '/gov/primer-congress.jpg',
    alt: 'The U.S. Capitol building',
  },
  {
    title: 'You have three people there.',
    body: 'One representative for your district, and two senators for your whole state. Your address is enough to find all three.',
    term: 'district',
    image: '/gov/primer-reps.jpg',
    alt: 'The empty House chamber, with its rows of seats',
  },
  {
    title: 'A bill is a proposed law.',
    body: 'A member writes it, a small committee studies it, and then the whole House or Senate may vote. Most bills never get that far.',
    term: 'bill',
    image: '/gov/primer-bill.jpg',
    alt: 'The first page of the Civil Rights Act of 1964',
  },
  {
    title: 'Every recorded vote is public.',
    body: 'In a roll call vote each member’s yes (yea) or no (nay) is written down by name. That record is what you see here.',
    term: 'rollCall',
    image: '/gov/primer-vote.jpg',
    alt: 'Senators at their desks in the Senate chamber',
  },
  {
    title: 'It becomes law in three steps.',
    body: 'The House passes it, the Senate passes the same text, and the President signs it. A veto can be overridden by two-thirds of both.',
    term: 'enacted',
    image: '/gov/primer-law.jpg',
    alt: 'President Lyndon Johnson signing the Civil Rights Act in 1964',
  },
]
