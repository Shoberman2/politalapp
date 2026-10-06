// The landing FAQ. Shared by the page (src/components/Landing.jsx) and the
// server-rendered homepage + FAQPage JSON-LD (api/), so what search engines and
// AI answer engines read is exactly what visitors read. Plain text only.
export const LANDING_FAQ = [
  {
    q: 'What is BallotWatch?',
    a: 'An open-source record of Congress: who represents you, how they voted on every roll call, and what each bill does, with every fact linked to its official source. It also helps you write to your representatives about a specific vote.',
  },
  {
    q: 'Is it free?',
    a: 'Yes. Reading the record needs no account: members, votes, bills, Tell your rep, and the public API. You only need a free account for an API key.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Congress.gov, the House Clerk and the Senate for bills and votes, the U.S. Census Bureau for districts, and the FEC for campaign finance. It is refreshed daily.',
  },
  {
    q: 'Does BallotWatch send messages for me?',
    a: 'No. We start your message with the facts of the vote. You write the rest and send it through your representative’s official contact page. We don’t save what you write.',
  },
  {
    q: 'Is it partisan?',
    a: 'No. Every member gets the same pages and the same facts. We don’t score members, pick “key votes,” or tell you how to feel about a vote.',
  },
  {
    q: 'How is AI used?',
    a: 'Only to explain: bills from their official summaries and what procedural votes decided, always labeled as AI. It never writes as your representative or decides anything for you.',
  },
]
