export const FEATURE_READABILITY = [
  {
    feature: 'Representative lookup',
    question: 'Who represents this address or district?',
    source: 'Census district data and congressional member records',
    cadence: 'Updated as source data and member terms change',
    action: 'Find representatives and open their voting records',
  },
  {
    feature: 'Bill tracker',
    question: 'What does this bill do and where is it now?',
    source: 'Congress.gov bill, action, sponsor, and committee data',
    cadence: 'Updated by the ETL pipeline',
    action: 'Search bills, inspect source links, and share citations',
  },
  {
    feature: 'Vote records',
    question: 'How did a member vote?',
    source: 'House and Senate roll call records',
    cadence: 'Updated as new roll calls publish',
    action: 'Filter by member, date, bill, chamber, or issue',
  },
  {
    feature: 'Legislative path',
    question: 'Where does this bill go next?',
    source: 'Committee routing plus BallotWatch methodology',
    cadence: 'Recomputed when bill routing changes',
    action: 'Read the route, caveat, and methodology version',
  },
  {
    feature: 'Campaign finance context',
    question: 'What money context is visible?',
    source: 'Federal Election Commission data and local industry mapping',
    cadence: 'Refreshed as campaign finance data is queried',
    action: 'Inspect donors, industries, and visible caveats',
  },
  {
    feature: 'API and sample data',
    question: 'How can I build with BallotWatch?',
    source: 'Hosted API, OpenAPI spec, and public schema samples',
    cadence: 'API is hosted; samples are versioned manually',
    action: 'Read docs, download samples, or request an API key',
  },
]

export const OPEN_TRACKS = [
  {
    title: 'Use the app',
    text: 'Find representatives, browse bills, check votes, and read source-linked summaries without needing to understand congressional databases first.',
    links: [
      { label: 'Find representatives', to: '/my-representative' },
      { label: 'Browse bills', to: '/bills' },
    ],
  },
  {
    title: 'Use the data',
    text: 'Start with schema samples, the OpenAPI contract, and hosted API docs. Full hosted access remains available for teams that need volume and freshness.',
    links: [
      { label: 'API docs', to: '/developers/docs' },
      { label: 'Sample data', href: '/data/datapackage.json' },
    ],
  },
  {
    title: 'Check the work',
    text: 'Every computed or AI-assisted feature should explain its source, method, update cadence, caveat, and code reference.',
    links: [
      { label: 'Methodology', to: '/methodology' },
      { label: 'Data sources', to: '/methodology/data-sources' },
    ],
  },
  {
    title: 'Contribute',
    text: 'Improve docs, examples, tests, accessibility, data QA, and methodology. Corrections need public source evidence.',
    links: [
      { label: 'GitHub', href: 'https://github.com/Shoberman2/politalapp' },
      { label: 'Starter issues', href: 'https://github.com/Shoberman2/politalapp/blob/main/docs/starter-issues.md' },
    ],
  },
]

export const METHODOLOGY_PAGES = [
  {
    slug: 'data-sources',
    title: 'Data Sources',
    dek: 'Where BallotWatch data comes from and what each source supports.',
    source: 'Congress.gov, Census, FEC, LegiScan, and BallotWatch ETL metadata',
    cadence: 'Reviewed as source integrations change',
    caveat: 'Official records can be corrected after first publication, and source coverage varies by dataset.',
    codeRefs: ['etl/README.md', 'etl/run.ts', 'supabase/schema.sql'],
    sections: [
      {
        heading: 'Federal legislation and votes',
        body: 'Congress.gov and chamber roll call feeds support bills, actions, sponsorship, vote positions, and committee routing where available.',
      },
      {
        heading: 'District lookup',
        body: 'Census district data supports address-to-district matching. Redistricting, vacancies, and special elections can create temporary ambiguity.',
      },
      {
        heading: 'Campaign finance',
        body: 'FEC records provide donation and committee context. Finance records add context; they do not prove causation.',
      },
    ],
  },
  {
    slug: 'ai-explanations',
    title: 'Source-Linked Explanations',
    dek: 'How BallotWatch explains congressional records with structured public data and AI assistance.',
    source: 'Structured bill, vote, routing, and deterministic statistics passed to server-side AI functions',
    cadence: 'Cached by prompt version and regenerated when prompts change',
    caveat: 'AI text is explanatory. It does not replace official source records.',
    codeRefs: [
      'supabase/functions/explain-bill/index.ts',
      'supabase/functions/explain-bill-path/index.ts',
      'supabase/functions/narrate-votes/index.ts',
    ],
    sections: [
      {
        heading: 'Grounded inputs',
        body: 'AI functions receive structured records such as bill title, official summaries, committee routing, roll call question text, and computed statistics.',
      },
      {
        heading: 'Guardrails',
        body: 'AI output cannot invent vote counts or percentages. Some flows filter politically loaded phrasing and fall back to deterministic copy when needed.',
      },
      {
        heading: 'Display standard',
        body: 'Generated explanations use section-level disclosure and editorial marginalia, not per-sentence badges.',
      },
    ],
  },
  {
    slug: 'committee-survival',
    title: 'Committee Survival',
    dek: 'How often bills assigned to a primary committee advance beyond that committee.',
    source: 'Bill committee routing, legislative stages, and BallotWatch committee survival computation',
    cadence: 'Recomputed when routing backfills or weekly jobs run',
    caveat: 'This is descriptive history, not a prediction.',
    codeRefs: ['etl/computeCommitteeSurvival.ts', 'src/components/BillRoutingPanel.jsx'],
    sections: [
      {
        heading: 'Primary committee',
        body: 'Each bill counts toward exactly one primary committee: the earliest referral, with ties broken by committee code.',
      },
      {
        heading: 'Advanced bills',
        body: 'A bill counts as advanced when routing or legislative-stage data shows reported, discharged, markup activity, floor consideration, or later progress.',
      },
      {
        heading: 'Confidence floor',
        body: 'Percentages should only display when enough committee history exists to avoid noisy numbers.',
      },
    ],
  },
  {
    slug: 'sponsor-activity',
    title: 'Sponsor Activity',
    dek: 'What primary bill sponsorship can and cannot tell you about a member.',
    source: 'Congress.gov sponsor data and BallotWatch sponsor backfill',
    cadence: 'Updated as bill sponsor data is extracted',
    caveat: 'Bill count is activity, not effectiveness.',
    codeRefs: ['src/components/SponsorActivityBadge.jsx', 'etl/backfillSponsorAndRoutings.ts'],
    sections: [
      {
        heading: 'Primary sponsorship only',
        body: 'The count includes bills where the member is the primary sponsor. Cosponsorship is separate behavior.',
      },
      {
        heading: 'Median comparison',
        body: 'Chamber medians help readers understand scale, but new members and replacements need careful denominator handling.',
      },
      {
        heading: 'Interpretation',
        body: 'A single major bill and many symbolic resolutions can look similar in simple counts. The UI should say that plainly.',
      },
    ],
  },
  {
    slug: 'campaign-finance-matching',
    title: 'Campaign Finance Matching',
    dek: 'How donation context is matched to member profiles and policy areas.',
    source: 'Federal Election Commission data and BallotWatch industry mapping',
    cadence: 'Refreshed when finance data is queried or mappings change',
    caveat: 'Campaign finance context does not prove why a member voted a certain way.',
    codeRefs: ['src/services/donations.js', 'src/data/industryMap.js'],
    sections: [
      {
        heading: 'Candidate matching',
        body: 'BallotWatch matches names and states to FEC candidate records, then aggregates available donation records.',
      },
      {
        heading: 'Industry mapping',
        body: 'Local mapping connects industries to policy areas so readers can compare context against voting behavior.',
      },
      {
        heading: 'Caveat',
        body: 'The feature provides context only. It should never imply causation without evidence.',
      },
    ],
  },
  {
    slug: 'corrections',
    title: 'Corrections',
    dek: 'How source-linked data corrections should work.',
    source: 'Public source URLs submitted by users and reviewed by maintainers',
    cadence: 'Reviewed as reports arrive',
    caveat: 'Corrections are for factual records and methodology, not political agreement.',
    codeRefs: ['.github/ISSUE_TEMPLATE/data_correction.yml', 'CONTRIBUTING.md'],
    sections: [
      {
        heading: 'Required evidence',
        body: 'A correction needs a BallotWatch record, the field that appears wrong, the expected value, and a public source URL.',
      },
      {
        heading: 'Review',
        body: 'Maintainers review corrections, update code or data where appropriate, and record material accepted corrections publicly.',
      },
      {
        heading: 'Not a correction',
        body: 'Campaign messaging, partisan framing, or claims without public sources should be closed rather than merged into the data layer.',
      },
    ],
  },
]
