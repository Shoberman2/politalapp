import axios from 'axios'

const BASE_URL = 'https://api.congress.gov/v3'
const API_KEY = import.meta.env.VITE_CONGRESS_API_KEY || 'TylrF1qkaHLXnqNUgeBSbclgONTIxEpDCAqMrvOs'

const shutdownApi = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: API_KEY,
    format: 'json'
  }
})

// Historical government shutdowns
export const SHUTDOWN_HISTORY = [
  {
    startDate: '2018-12-22',
    endDate: '2019-01-25',
    durationDays: 35,
    president: 'Donald Trump',
    controlHouse: 'Republican (then Democratic Jan 3)',
    controlSenate: 'Republican',
    cause: 'Border wall funding dispute',
    description: 'Longest shutdown in U.S. history. Dispute over $5.7 billion for a U.S.–Mexico border wall.'
  },
  {
    startDate: '2018-02-09',
    endDate: '2018-02-09',
    durationDays: 1,
    president: 'Donald Trump',
    controlHouse: 'Republican',
    controlSenate: 'Republican',
    cause: 'Budget cap disagreements',
    description: 'Brief funding gap overnight before a two-year budget deal was signed.'
  },
  {
    startDate: '2018-01-20',
    endDate: '2018-01-22',
    durationDays: 3,
    president: 'Donald Trump',
    controlHouse: 'Republican',
    controlSenate: 'Republican',
    cause: 'DACA and immigration dispute',
    description: 'Democrats sought a deal on DACA protections for Dreamers. Ended with a short-term CR.'
  },
  {
    startDate: '2013-10-01',
    endDate: '2013-10-17',
    durationDays: 16,
    president: 'Barack Obama',
    controlHouse: 'Republican',
    controlSenate: 'Democratic',
    cause: 'Affordable Care Act dispute',
    description: 'House Republicans sought to defund or delay the Affordable Care Act as a condition of funding.'
  },
  {
    startDate: '1995-12-16',
    endDate: '1996-01-06',
    durationDays: 21,
    president: 'Bill Clinton',
    controlHouse: 'Republican',
    controlSenate: 'Republican',
    cause: 'Budget balancing dispute',
    description: 'Second shutdown of FY1996 over disagreements on balancing the federal budget.'
  },
  {
    startDate: '1995-11-14',
    endDate: '1995-11-19',
    durationDays: 5,
    president: 'Bill Clinton',
    controlHouse: 'Republican',
    controlSenate: 'Republican',
    cause: 'Budget balancing dispute',
    description: 'First of two shutdowns over balancing the budget in seven years. Ended with a temporary CR.'
  },
  {
    startDate: '1990-10-06',
    endDate: '1990-10-09',
    durationDays: 3,
    president: 'George H.W. Bush',
    controlHouse: 'Democratic',
    controlSenate: 'Democratic',
    cause: 'Deficit reduction dispute',
    description: 'Brief weekend shutdown over deficit reduction. Led to the Budget Enforcement Act of 1990.'
  },
  {
    startDate: '1987-12-18',
    endDate: '1987-12-20',
    durationDays: 2,
    president: 'Ronald Reagan',
    controlHouse: 'Democratic',
    controlSenate: 'Democratic',
    cause: 'Contra aid and fairness doctrine dispute',
    description: 'Dispute over funding for Nicaraguan Contras and the FCC fairness doctrine.'
  },
  {
    startDate: '1986-10-17',
    endDate: '1986-10-18',
    durationDays: 1,
    president: 'Ronald Reagan',
    controlHouse: 'Democratic',
    controlSenate: 'Republican',
    cause: 'Various spending disputes',
    description: 'Brief overnight shutdown over multiple spending issues.'
  },
  {
    startDate: '1984-10-04',
    endDate: '1984-10-05',
    durationDays: 1,
    president: 'Ronald Reagan',
    controlHouse: 'Democratic',
    controlSenate: 'Republican',
    cause: 'Water projects and civil rights dispute',
    description: 'Dispute over water projects package and civil rights measures.'
  },
  {
    startDate: '1984-09-30',
    endDate: '1984-10-03',
    durationDays: 3,
    president: 'Ronald Reagan',
    controlHouse: 'Democratic',
    controlSenate: 'Republican',
    cause: 'Crime package and water projects',
    description: 'Disagreements over a comprehensive crime package and water projects.'
  },
  {
    startDate: '1983-11-10',
    endDate: '1983-11-14',
    durationDays: 3,
    president: 'Ronald Reagan',
    controlHouse: 'Democratic',
    controlSenate: 'Republican',
    cause: 'MX missile and oil interests',
    description: 'Dispute over MX missile funding and oil production interests.'
  },
  {
    startDate: '1982-12-17',
    endDate: '1982-12-21',
    durationDays: 3,
    president: 'Ronald Reagan',
    controlHouse: 'Democratic',
    controlSenate: 'Republican',
    cause: 'Jobs bill and MX missile funding',
    description: 'Dispute over public works jobs bill and MX missile funding.'
  },
  {
    startDate: '1982-09-30',
    endDate: '1982-10-02',
    durationDays: 1,
    president: 'Ronald Reagan',
    controlHouse: 'Democratic',
    controlSenate: 'Republican',
    cause: 'Supplemental spending disagreements',
    description: 'Brief funding gap over supplemental spending measures.'
  },
  {
    startDate: '1981-11-20',
    endDate: '1981-11-23',
    durationDays: 2,
    president: 'Ronald Reagan',
    controlHouse: 'Democratic',
    controlSenate: 'Republican',
    cause: 'Spending cut disagreements',
    description: 'Reagan vetoed a spending bill that did not contain enough cuts.'
  },
  {
    startDate: '1979-09-30',
    endDate: '1979-10-12',
    durationDays: 11,
    president: 'Jimmy Carter',
    controlHouse: 'Democratic',
    controlSenate: 'Democratic',
    cause: 'Pay raise and abortion funding',
    description: 'Dispute over congressional pay raise and abortion funding restrictions.'
  },
  {
    startDate: '1978-09-30',
    endDate: '1978-10-18',
    durationDays: 18,
    president: 'Jimmy Carter',
    controlHouse: 'Democratic',
    controlSenate: 'Democratic',
    cause: 'Public works and defense spending',
    description: 'Carter vetoed a defense bill and a public works bill with a nuclear-powered aircraft carrier.'
  },
  {
    startDate: '1977-09-30',
    endDate: '1977-10-13',
    durationDays: 12,
    president: 'Jimmy Carter',
    controlHouse: 'Democratic',
    controlSenate: 'Democratic',
    cause: 'Abortion funding (Medicaid)',
    description: 'Dispute over whether Medicaid funds could be used for abortions.'
  },
  {
    startDate: '1977-10-31',
    endDate: '1977-11-09',
    durationDays: 8,
    president: 'Jimmy Carter',
    controlHouse: 'Democratic',
    controlSenate: 'Democratic',
    cause: 'Abortion funding (Medicaid)',
    description: 'Continued dispute over Medicaid abortion funding restrictions.'
  },
  {
    startDate: '1977-11-30',
    endDate: '1977-12-09',
    durationDays: 8,
    president: 'Jimmy Carter',
    controlHouse: 'Democratic',
    controlSenate: 'Democratic',
    cause: 'Abortion funding (Medicaid)',
    description: 'Third shutdown over the same Medicaid abortion funding disagreement in FY1978.'
  },
  {
    startDate: '1976-09-30',
    endDate: '1976-10-11',
    durationDays: 10,
    president: 'Gerald Ford',
    controlHouse: 'Democratic',
    controlSenate: 'Democratic',
    cause: 'Labor-HEW appropriations veto',
    description: 'Ford vetoed the Labor-HEW appropriations bill, triggering the first modern government shutdown.'
  }
]

// Current fiscal year funding deadlines and appropriations bills
export const FUNDING_DEADLINES = {
  fiscalYear: 2026,
  congress: 119,
  lastUpdated: '2026-06-11',
  deadlines: [
    {
      date: '2025-03-14',
      description: 'FY2025 Continuing Resolution expires (first tranche)',
      status: 'passed'
    },
    {
      date: '2025-09-30',
      description: 'End of FY2025 — all FY2025 funding expires',
      status: 'passed'
    },
    {
      date: '2025-12-20',
      description: 'FY2026 Continuing Resolution expires',
      status: 'passed'
    },
    {
      date: '2026-03-14',
      description: 'FY2026 CR extension deadline',
      status: 'passed'
    },
    {
      date: '2026-09-30',
      description: 'End of FY2026 — all funding expires without full-year bills',
      status: 'upcoming'
    }
  ],
  appropriationsBills: [
    {
      name: 'Agriculture, Rural Development, Food and Drug Administration',
      shortName: 'Agriculture',
      status: 'cr',
      searchTerms: ['agriculture appropriation', 'rural development appropriation'],
      fundingAmount: '$26.5 billion',
      description: 'Funds the Department of Agriculture, Food and Drug Administration, rural development loans and grants, food safety inspections, agricultural research, the Supplemental Nutrition Assistance Program (SNAP) administration, and the Commodity Futures Trading Commission.'
    },
    {
      name: 'Commerce, Justice, Science',
      shortName: 'Commerce-Justice-Science',
      status: 'cr',
      searchTerms: ['commerce justice science appropriation'],
      fundingAmount: '$76.4 billion',
      description: 'Funds the Department of Justice (FBI, DEA, federal prisons, U.S. Marshals), Department of Commerce (Census Bureau, NOAA, Patent Office), NASA, the National Science Foundation, and Legal Services Corporation.'
    },
    {
      name: 'Defense',
      shortName: 'Defense',
      status: 'cr',
      searchTerms: ['defense appropriation', 'department of defense appropriation'],
      fundingAmount: '$849 billion',
      description: 'The largest of the 12 bills. Funds military personnel, operations and maintenance, weapons procurement, research and development, and military construction for the Army, Navy, Air Force, Marine Corps, and Space Force. Does not include the Department of Energy\'s nuclear weapons programs.'
    },
    {
      name: 'Energy and Water Development',
      shortName: 'Energy-Water',
      status: 'cr',
      searchTerms: ['energy water appropriation', 'energy and water development'],
      fundingAmount: '$59.2 billion',
      description: 'Funds the Department of Energy (including nuclear weapons programs and clean energy research), the Army Corps of Engineers (flood control, navigation, water infrastructure), the Bureau of Reclamation, and the Nuclear Regulatory Commission.'
    },
    {
      name: 'Financial Services and General Government',
      shortName: 'Financial Services',
      status: 'cr',
      searchTerms: ['financial services appropriation', 'general government appropriation'],
      fundingAmount: '$28.9 billion',
      description: 'Funds the Treasury Department, IRS, federal courts, the Executive Office of the President, the SEC, FTC, Small Business Administration, General Services Administration, and the District of Columbia\'s federal payment.'
    },
    {
      name: 'Homeland Security',
      shortName: 'Homeland Security',
      status: 'cr',
      searchTerms: ['homeland security appropriation'],
      fundingAmount: '$62.7 billion',
      description: 'Funds the Department of Homeland Security including Customs and Border Protection, Immigration and Customs Enforcement (ICE), the Coast Guard, Secret Service, TSA, FEMA disaster relief, and cybersecurity operations (CISA).'
    },
    {
      name: 'Interior, Environment',
      shortName: 'Interior-Environment',
      status: 'cr',
      searchTerms: ['interior environment appropriation'],
      fundingAmount: '$40.2 billion',
      description: 'Funds the Department of the Interior (National Park Service, Bureau of Land Management, Fish and Wildlife Service), the Environmental Protection Agency, the U.S. Forest Service, the Smithsonian Institution, and Indian Health Service.'
    },
    {
      name: 'Labor, Health and Human Services, Education',
      shortName: 'Labor-HHS-Education',
      status: 'cr',
      searchTerms: ['labor health human services appropriation', 'labor hhs education'],
      fundingAmount: '$208.3 billion',
      description: 'The largest non-defense bill. Funds the Departments of Labor, Health and Human Services, and Education. Covers NIH medical research, CDC, Head Start, Pell Grants, job training, substance abuse programs, and community health centers.'
    },
    {
      name: 'Legislative Branch',
      shortName: 'Legislative Branch',
      status: 'cr',
      searchTerms: ['legislative branch appropriation'],
      fundingAmount: '$6.9 billion',
      description: 'Funds the operations of Congress itself, the Library of Congress, the Government Accountability Office (GAO), the Congressional Budget Office (CBO), the Capitol Police, and the Architect of the Capitol.'
    },
    {
      name: 'Military Construction, Veterans Affairs',
      shortName: 'MilCon-VA',
      status: 'cr',
      searchTerms: ['military construction appropriation', 'veterans affairs appropriation'],
      fundingAmount: '$156.7 billion',
      description: 'Funds military base construction and family housing, and the Department of Veterans Affairs including VA healthcare, disability compensation, the GI Bill education benefits, and veterans\' home loan programs.'
    },
    {
      name: 'State, Foreign Operations',
      shortName: 'State-Foreign Ops',
      status: 'cr',
      searchTerms: ['state foreign operations appropriation'],
      fundingAmount: '$58.1 billion',
      description: 'Funds the State Department, USAID, diplomatic operations, embassy security, international peacekeeping, global health programs (including PEPFAR), foreign military financing, and contributions to international organizations like the UN.'
    },
    {
      name: 'Transportation, Housing and Urban Development',
      shortName: 'Transportation-HUD',
      status: 'cr',
      searchTerms: ['transportation hud appropriation', 'housing urban development appropriation'],
      fundingAmount: '$90.8 billion',
      description: 'Funds the Department of Transportation (FAA, Federal Highway Administration, Amtrak, transit grants) and the Department of Housing and Urban Development (Section 8 housing vouchers, public housing, FHA, community development block grants).'
    }
  ]
}

// Risk level explainers
export const RISK_EXPLAINERS = {
  funded: 'All 12 appropriations bills have been signed into law. The government is fully funded for the fiscal year with no shutdown risk.',
  low: 'While not all appropriations bills are signed, there is significant time before the next funding deadline. Congress has room to negotiate.',
  moderate: 'The funding deadline is approaching and several bills remain unsigned. Congress needs to act to avoid disruption.',
  high: 'The funding deadline is very close with most bills unsigned. A continuing resolution or omnibus bill may be needed to prevent a shutdown.',
  critical: 'A government shutdown is imminent unless Congress acts immediately. Essential services could be disrupted within days.',
  shutdown: 'Funding has lapsed. Non-essential government functions are suspended. Federal employees may be furloughed.'
}

// In-memory cache for API results
let billCache = null
let billCacheTimestamp = 0
const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes

export const fetchAppropriationsBills = async (congress = 119) => {
  const now = Date.now()
  if (billCache && (now - billCacheTimestamp) < CACHE_DURATION) {
    return billCache
  }

  const billTypes = ['hr', 's', 'hjres', 'sjres']
  const allBills = []

  for (const type of billTypes) {
    try {
      const response = await shutdownApi.get(`/bill/${congress}/${type}`, {
        params: { limit: 250, sort: 'updateDate+desc' }
      })
      const bills = response.data.bills || []
      allBills.push(...bills)
    } catch (err) {
      console.warn(`[Shutdown] Error fetching ${type} bills:`, err.message)
    }
  }

  // Filter for appropriations-related bills
  const keywords = [
    'appropriation', 'continuing resolution', 'continuing appropriation',
    'omnibus', 'minibus', 'full-year', 'further consolidated',
    'consolidated appropriation', 'making appropriation'
  ]

  const filtered = allBills.filter(bill => {
    const title = (bill.title || '').toLowerCase()
    return keywords.some(kw => title.includes(kw))
  })

  billCache = filtered
  billCacheTimestamp = now
  return filtered
}

export const calculateShutdownRisk = (deadlines = FUNDING_DEADLINES, apiBills = null) => {
  const now = new Date()

  // Find the next active/upcoming deadline
  const activeDeadlines = deadlines.deadlines
    .filter(d => d.status === 'active' || d.status === 'upcoming')
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  const nextDeadline = activeDeadlines[0]

  if (!nextDeadline) {
    return {
      level: 'funded',
      score: 0,
      summary: 'The government is fully funded for the current fiscal year.',
      daysUntilDeadline: null,
      billsSigned: 0,
      nextDeadline: null
    }
  }

  const deadlineDate = new Date(nextDeadline.date + 'T00:00:00')
  const msUntil = deadlineDate - now
  const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24))

  // Time pressure score (0-50)
  let timeScore = 0
  if (daysUntil <= 0) timeScore = 50
  else if (daysUntil <= 3) timeScore = 45
  else if (daysUntil <= 7) timeScore = 35
  else if (daysUntil <= 14) timeScore = 25
  else if (daysUntil <= 30) timeScore = 15
  else if (daysUntil <= 60) timeScore = 8
  else timeScore = 2

  // Legislative progress score (0-50)
  const bills = deadlines.appropriationsBills
  const statusScores = {
    signed: 0,
    passed_both: 5,
    passed_one: 8,
    committee: 10,
    introduced: 12,
    cr: 6,
    not_introduced: 15,
    lapsed: 15
  }

  let billsSigned = 0
  let progressScore = 0
  bills.forEach(bill => {
    if (bill.status === 'signed') billsSigned++
    progressScore += (statusScores[bill.status] || 12)
  })

  // Normalize progress score to 0-50 range
  // Max possible = 12 bills * 15 = 180, min = 0
  const normalizedProgress = Math.min(50, Math.round((progressScore / 180) * 50))

  const totalScore = Math.min(100, timeScore + normalizedProgress)

  let level, summary
  if (daysUntil <= 0 && billsSigned < 12) {
    level = 'shutdown'
    summary = 'A government shutdown is in effect or imminent. Funding has lapsed.'
  } else if (totalScore >= 80) {
    level = 'critical'
    summary = `Shutdown risk is critical. Only ${billsSigned}/12 appropriations bills signed with ${daysUntil} days until the deadline.`
  } else if (totalScore >= 60) {
    level = 'high'
    summary = `Shutdown risk is high. ${billsSigned}/12 bills signed, ${daysUntil} days until the funding deadline.`
  } else if (totalScore >= 40) {
    level = 'moderate'
    summary = `Shutdown risk is moderate. ${billsSigned}/12 bills signed with ${daysUntil} days remaining.`
  } else if (totalScore >= 15) {
    level = 'low'
    summary = `Shutdown risk is low. ${billsSigned}/12 bills signed, ${daysUntil} days until the deadline.`
  } else {
    level = 'funded'
    summary = 'The government is funded. Appropriations are on track.'
  }

  return {
    level,
    score: totalScore,
    summary,
    daysUntilDeadline: daysUntil,
    billsSigned,
    nextDeadline
  }
}

export const getCountdown = (targetDate) => {
  const now = new Date()
  const target = new Date(targetDate + 'T00:00:00')
  const diff = target - now

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, expired: true }
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  return { days, hours, minutes, expired: false }
}
