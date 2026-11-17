// BallotWatch + CivicRelay merge under the planned name Plainfloor (founder
// decision 2026-10-02). The live site stays "BallotWatch" until a professional
// trademark search clears and the domain is bought; then set name below.
// Every new surface reads its name and mission from here. Older
// pages still hard-code "BallotWatch"; move them here as they're touched.
export const BRAND = {
  name: 'BallotWatch',
  // Both privacy claims are scoped to the website on purpose: no form here asks
  // for a name, and a ZIP typed into the lookup goes from the browser to a
  // public service. The MCP tool find_representatives does receive a ZIP or
  // address from an assistant, so never widen this to "we never see a ZIP".
  mission: 'We use AI to make Congress easier to read. We never ask your name, and the ZIP code you enter here never reaches our servers.',
  // Contact address for congressional offices. Left empty until the founder
  // picks one; /offices hides the contact action while it's empty.
  officesEmail: '',
  // Public contact address for readers (corrections, privacy requests,
  // general questions). Empty until the founder sets one up; /contact,
  // /privacy and /terms show the email only when this is non-empty and
  // otherwise point to GitHub issues.
  contactEmail: '',
}
