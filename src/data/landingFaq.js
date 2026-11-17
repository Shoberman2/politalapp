// The landing FAQ. Shared by the page (src/components/Landing.jsx) and the
// server-rendered homepage + FAQPage JSON-LD (api/), so what search engines and
// AI answer engines read is exactly what visitors read. Plain text only.
export const LANDING_FAQ = [
  {
    q: 'How do I find out who represents me?',
    a: 'Enter your street address. We match it to your congressional district with U.S. Census data and show your House member and both senators. A ZIP code alone finds your two senators.',
  },
  {
    q: 'What happens to my ZIP code or address?',
    a: 'No sign-up is needed to look up. Your ZIP code goes from your browser to a public lookup service (Zippopotam.us) to find your state, and a street address goes from your browser to the U.S. Census Bureau to find your district. Your ZIP code never reaches our servers.',
  },
  {
    q: 'Do I need an account, and what does it cost?',
    a: 'An account is free, and you need one for the app’s tools: your representatives, the bills browser, the district map, the shutdown tracker, campaign-finance comparison, AI Congress and the members list. Looking up who represents you, this week’s votes, every member profile and record card, every bill and roll call, and the public API need no account.',
  },
  {
    q: 'Where does the record come from, and how current is it?',
    a: 'Congress.gov, the House Clerk and the Senate for bills and votes, the U.S. Census Bureau for districts, and the FEC for campaign finance. It is refreshed daily.',
  },
  {
    q: 'Does BallotWatch take a side?',
    a: 'No. Every member gets the same pages and the same facts. We don’t score members, pick “key votes,” or tell you how to feel about a vote.',
  },
  {
    q: 'Can I contact my representative from here?',
    a: 'Yes, about a specific vote. We start your message with the facts of the vote. You write the rest and send it through your representative’s official contact page. We don’t send anything for you, and we don’t save what you write.',
  },
  {
    q: 'Who runs the federal departments?',
    a: 'The President picks the head of each of the 15 executive departments, and the Senate must confirm each one. Congress creates the departments, sets their budgets and oversees them through its committees.',
  },
  {
    q: 'How is AI used?',
    a: 'Only to explain: bills from their official text (or the official summary when the text is too long or not yet published) and what procedural votes decided, always labeled as AI. It never writes as your representative or decides anything for you.',
  },
  {
    q: 'Can developers and AI assistants use the record?',
    a: 'Yes. Every member, vote and bill is free as a public API, as bulk files, and through an MCP server for assistants such as Claude and ChatGPT. Reading needs no key.',
  },
]
