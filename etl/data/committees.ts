/**
 * Congressional committee glossary — hand-curated.
 *
 * One-sentence "what this committee actually does" gloss per committee and
 * subcommittee, sourced from House Rule X and Senate Rule XXV (the official
 * jurisdiction definitions).
 *
 * Quarterly review TODO: subcommittees rename and reorganize. Check
 * `unknown_committee_codes` table in Supabase for codes encountered in the
 * wild but missing here, then refresh.
 *
 * Conventions:
 *   - committee_code is the Congress.gov "systemCode" string (e.g., "HSAG", "SSCM").
 *   - Glosses are one sentence, plain English, present-tense, ≤ 25 words.
 *   - When unknown, the UI falls back to rendering the committee name only.
 *
 * Coverage as of 2026-05 (119th Congress):
 *   - All 20 House standing committees + select select committees
 *   - All 16 Senate standing committees + select select committees
 *   - Joint committees (4)
 *   - Subcommittees covered for the highest-traffic committees;
 *     others fall back to the parent gloss + name-only rendering.
 */

export interface CommitteeGlossEntry {
  name: string;
  chamber: 'house' | 'senate' | 'joint';
  gloss: string;
  isSubcommittee?: boolean;
  parentCode?: string;
}

export const COMMITTEE_GLOSSARY: Record<string, CommitteeGlossEntry> = {
  // ============================================================
  // HOUSE STANDING COMMITTEES (Rule X)
  // ============================================================
  HSAG: {
    name: 'House Committee on Agriculture',
    chamber: 'house',
    gloss: 'Writes farm bills, sets crop subsidy and nutrition (SNAP) policy, and oversees the USDA.',
  },
  HSAP: {
    name: 'House Committee on Appropriations',
    chamber: 'house',
    gloss: 'Writes the 12 annual spending bills that fund every federal agency and program.',
  },
  HSAS: {
    name: 'House Committee on Armed Services',
    chamber: 'house',
    gloss: 'Authorizes Defense Department spending and policy through the annual NDAA; oversees the military and military families.',
  },
  HSBA: {
    name: 'House Committee on the Budget',
    chamber: 'house',
    gloss: 'Sets the annual budget resolution that frames how Congress spends and taxes; handles reconciliation rules.',
  },
  HSED: {
    name: 'House Committee on Education and the Workforce',
    chamber: 'house',
    gloss: 'Oversees federal education programs (K-12, higher ed), labor law, pensions, and worker protections.',
  },
  HSIF: {
    name: 'House Committee on Energy and Commerce',
    chamber: 'house',
    gloss: 'Broad jurisdiction over health care, energy policy, telecommunications, consumer protection, and interstate commerce.',
  },
  HSSO: {
    name: 'House Committee on Ethics',
    chamber: 'house',
    gloss: 'Investigates allegations of misconduct by House members and staff; enforces the House code of conduct.',
  },
  HSBU: {
    name: 'House Committee on Financial Services',
    chamber: 'house',
    gloss: 'Oversees banks, securities, insurance, housing, and the Federal Reserve.',
  },
  HSFA: {
    name: 'House Committee on Foreign Affairs',
    chamber: 'house',
    gloss: 'Sets US foreign policy, oversees the State Department, treaties, foreign aid, and arms sales.',
  },
  HSHM: {
    name: 'House Committee on Homeland Security',
    chamber: 'house',
    gloss: 'Oversees DHS, border security, TSA, FEMA, cybersecurity, and counter-terrorism.',
  },
  HSHA: {
    name: 'House Committee on House Administration',
    chamber: 'house',
    gloss: 'Runs the House itself: elections law, campaign finance, and Capitol operations.',
  },
  HSJU: {
    name: 'House Committee on the Judiciary',
    chamber: 'house',
    gloss: 'Federal courts and judges, criminal law, immigration, civil liberties, antitrust, and impeachment.',
  },
  HSII: {
    name: 'House Committee on Natural Resources',
    chamber: 'house',
    gloss: 'Public lands, parks, mining, fisheries, Native American affairs, and water/energy on federal land.',
  },
  HSGO: {
    name: 'House Committee on Oversight and Accountability',
    chamber: 'house',
    gloss: 'Investigates federal agencies and programs; subpoena power over executive branch operations.',
  },
  HSRU: {
    name: 'House Committee on Rules',
    chamber: 'house',
    gloss: 'Decides how bills come to the House floor — debate time, amendments allowed, and procedure.',
  },
  HSSY: {
    name: 'House Committee on Science, Space, and Technology',
    chamber: 'house',
    gloss: 'Civilian research, NASA, NSF, NIST, NOAA, energy research, and federal science policy.',
  },
  HSSM: {
    name: 'House Committee on Small Business',
    chamber: 'house',
    gloss: 'Oversees the SBA and federal programs affecting small businesses and entrepreneurs.',
  },
  HSPW: {
    name: 'House Committee on Transportation and Infrastructure',
    chamber: 'house',
    gloss: 'Highways, mass transit, aviation, rail, water resources, ports, and federal building construction.',
  },
  HSVR: {
    name: 'House Committee on Veterans\' Affairs',
    chamber: 'house',
    gloss: 'Oversees the VA, veterans benefits, health care, and military pensions.',
  },
  HSWM: {
    name: 'House Committee on Ways and Means',
    chamber: 'house',
    gloss: 'All federal taxes, Social Security, Medicare, trade agreements, and welfare programs.',
  },

  // House Select Committees
  HLIG: {
    name: 'House Permanent Select Committee on Intelligence',
    chamber: 'house',
    gloss: 'Oversight of the CIA, NSA, DIA, and the intelligence community; classified briefings.',
  },

  // ============================================================
  // SENATE STANDING COMMITTEES (Rule XXV)
  // ============================================================
  SSAF: {
    name: 'Senate Committee on Agriculture, Nutrition, and Forestry',
    chamber: 'senate',
    gloss: 'Senate counterpart on farm policy, nutrition (SNAP), forestry, and USDA oversight.',
  },
  SSAP: {
    name: 'Senate Committee on Appropriations',
    chamber: 'senate',
    gloss: 'Senate side of the 12 annual spending bills that fund every federal agency.',
  },
  SSAS: {
    name: 'Senate Committee on Armed Services',
    chamber: 'senate',
    gloss: 'Senate oversight of the military, DOD policy, the annual NDAA, and military nominations.',
  },
  SSBK: {
    name: 'Senate Committee on Banking, Housing, and Urban Affairs',
    chamber: 'senate',
    gloss: 'Banks, Federal Reserve, securities, insurance, public and private housing, and urban development.',
  },
  SSBU: {
    name: 'Senate Committee on the Budget',
    chamber: 'senate',
    gloss: 'Senate budget resolution, reconciliation procedure, and CBO oversight.',
  },
  SSCM: {
    name: 'Senate Committee on Commerce, Science, and Transportation',
    chamber: 'senate',
    gloss: 'Interstate commerce, transportation (highways, aviation, rail), telecommunications, consumer protection, and oceans/atmosphere.',
  },
  SSEG: {
    name: 'Senate Committee on Energy and Natural Resources',
    chamber: 'senate',
    gloss: 'Energy policy, public lands, national parks, mining, water, and nuclear regulation.',
  },
  SSEV: {
    name: 'Senate Committee on Environment and Public Works',
    chamber: 'senate',
    gloss: 'EPA oversight, clean air and water, highways, infrastructure, climate, and environmental regulations.',
  },
  SSFI: {
    name: 'Senate Committee on Finance',
    chamber: 'senate',
    gloss: 'All federal taxes, Social Security, Medicare, Medicaid, tariffs, trade, and revenue measures.',
  },
  SSFR: {
    name: 'Senate Committee on Foreign Relations',
    chamber: 'senate',
    gloss: 'Treaty ratification, ambassador confirmations, foreign aid, State Department oversight, and US foreign policy.',
  },
  SSGA: {
    name: 'Senate Committee on Homeland Security and Governmental Affairs',
    chamber: 'senate',
    gloss: 'DHS, federal workforce, postal service, civil service, and government efficiency.',
  },
  SSHR: {
    name: 'Senate Committee on Health, Education, Labor, and Pensions',
    chamber: 'senate',
    gloss: 'Public health, education, labor law, FDA, NIH, pensions, and worker protections.',
  },
  SSJU: {
    name: 'Senate Committee on the Judiciary',
    chamber: 'senate',
    gloss: 'Federal judicial nominations (Supreme Court, lower courts), criminal law, immigration, antitrust, and civil liberties.',
  },
  SSRA: {
    name: 'Senate Committee on Rules and Administration',
    chamber: 'senate',
    gloss: 'Senate rules, federal elections, campaign finance, and Capitol operations.',
  },
  SSSB: {
    name: 'Senate Committee on Small Business and Entrepreneurship',
    chamber: 'senate',
    gloss: 'SBA oversight, small business loans, contracting, and entrepreneur policy.',
  },
  SSVA: {
    name: 'Senate Committee on Veterans\' Affairs',
    chamber: 'senate',
    gloss: 'VA oversight, veterans benefits and health care, and military pensions.',
  },

  // Senate Select Committees
  SLIN: {
    name: 'Senate Select Committee on Intelligence',
    chamber: 'senate',
    gloss: 'Senate oversight of the CIA, NSA, and intelligence community; closed-door briefings.',
  },
  SLET: {
    name: 'Senate Select Committee on Ethics',
    chamber: 'senate',
    gloss: 'Investigates allegations of misconduct by senators and staff; enforces the Senate code.',
  },
  SLIA: {
    name: 'Senate Committee on Indian Affairs',
    chamber: 'senate',
    gloss: 'Federal-tribal relations, treaties, tribal lands, gaming, and Native health and education.',
  },
  SPAG: {
    name: 'Senate Special Committee on Aging',
    chamber: 'senate',
    gloss: 'Studies issues affecting older Americans: retirement, Medicare, long-term care, and elder fraud.',
  },

  // ============================================================
  // JOINT COMMITTEES
  // ============================================================
  JSEC: {
    name: 'Joint Economic Committee',
    chamber: 'joint',
    gloss: 'Studies the US economy and federal economic policy across both chambers; produces analysis reports.',
  },
  JSPR: {
    name: 'Joint Committee on Printing',
    chamber: 'joint',
    gloss: 'Oversees the Government Publishing Office and federal documents printing.',
  },
  JSLC: {
    name: 'Joint Committee on the Library',
    chamber: 'joint',
    gloss: 'Oversees the Library of Congress and federal cultural artifacts (Botanic Garden, statues).',
  },
  JSTX: {
    name: 'Joint Committee on Taxation',
    chamber: 'joint',
    gloss: 'Provides nonpartisan revenue analysis and scoring on tax legislation for both chambers.',
  },

  // ============================================================
  // HIGH-TRAFFIC SUBCOMMITTEES
  // ============================================================
  // Energy & Commerce subcommittees (HSIF)
  'HSIF03': {
    name: 'Subcommittee on Communications and Technology',
    chamber: 'house',
    gloss: 'Telecom, broadcasting, FCC oversight, broadband, and internet policy under E&C jurisdiction.',
    isSubcommittee: true,
    parentCode: 'HSIF',
  },
  'HSIF14': {
    name: 'Subcommittee on Health',
    chamber: 'house',
    gloss: 'Medicare, Medicaid, FDA, public health, and health insurance regulation.',
    isSubcommittee: true,
    parentCode: 'HSIF',
  },
  'HSIF17': {
    name: 'Subcommittee on Energy, Climate, and Grid Security',
    chamber: 'house',
    gloss: 'Energy policy, grid resilience, climate-related federal programs, and pipeline safety.',
    isSubcommittee: true,
    parentCode: 'HSIF',
  },

  // Judiciary subcommittees (HSJU)
  'HSJU01': {
    name: 'Subcommittee on Courts, Intellectual Property, and the Internet',
    chamber: 'house',
    gloss: 'Federal courts, patents, copyrights, trademarks, and online content regulation.',
    isSubcommittee: true,
    parentCode: 'HSJU',
  },
  'HSJU03': {
    name: 'Subcommittee on Immigration Integrity, Security, and Enforcement',
    chamber: 'house',
    gloss: 'Immigration law, visas, border enforcement, and asylum policy.',
    isSubcommittee: true,
    parentCode: 'HSJU',
  },

  // Senate Finance subcommittees (SSFI)
  'SSFI03': {
    name: 'Subcommittee on Health Care',
    chamber: 'senate',
    gloss: 'Medicare, Medicaid, CHIP, ACA, and health insurance tax provisions on the Senate side.',
    isSubcommittee: true,
    parentCode: 'SSFI',
  },
  'SSFI06': {
    name: 'Subcommittee on Taxation and IRS Oversight',
    chamber: 'senate',
    gloss: 'Federal tax code, IRS operations, tax administration, and revenue policy.',
    isSubcommittee: true,
    parentCode: 'SSFI',
  },

  // Senate Judiciary subcommittees (SSJU)
  'SSJU01': {
    name: 'Subcommittee on Federal Courts, Oversight, Agency Action, and Federal Rights',
    chamber: 'senate',
    gloss: 'Federal court system, judicial procedure, and civil rights enforcement.',
    isSubcommittee: true,
    parentCode: 'SSJU',
  },
  'SSJU04': {
    name: 'Subcommittee on Immigration, Citizenship, and Border Safety',
    chamber: 'senate',
    gloss: 'Senate immigration policy, visa law, asylum, and border enforcement.',
    isSubcommittee: true,
    parentCode: 'SSJU',
  },
};

/**
 * Look up a committee or subcommittee by Congress.gov systemCode.
 * Returns null if not in the glossary — caller should render
 * the name (always present from Congress.gov) without the gloss.
 */
export function lookupCommittee(code: string | null | undefined): CommitteeGlossEntry | null {
  if (!code) return null;
  return COMMITTEE_GLOSSARY[code.toUpperCase()] || null;
}
