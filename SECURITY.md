# Security Policy

Please do not open public issues for vulnerabilities, secrets, private keys,
auth bypasses, billing issues, or exposed user data.

## Reporting

Email the maintainer privately at:

security@ballotwatch.io

If that address is unavailable, open a minimal public issue that says you have a
private security report and need a maintainer contact. Do not include exploit
details in the public issue.

## Include

- Affected URL, file, endpoint, or workflow.
- Steps to reproduce.
- Impact.
- Whether user data, API keys, billing, or service-role credentials are involved.
- Suggested fix, if you have one.

## Scope

In scope:

- Authentication and authorization bugs.
- API key leakage or misuse.
- Supabase row-level security policy mistakes.
- Cross-site scripting or injection.
- Dependency vulnerabilities with a reachable exploit path.
- Leaked credentials in repository history.

## Open-source deployment safety

The repository is intentionally public. Secrets remain in Vercel or GitHub
Actions secret stores and are read only by server-side code. Values prefixed
with `VITE_` are public by design and must never contain Resend credentials,
Supabase service-role keys, webhook signing secrets, or other private tokens.

Bill-alert mutations derive the user from Supabase Auth and row-level security;
the browser never chooses a recipient address. Delivery resolves the current
confirmed Auth email on the server, snapshots it for auditability, and accepts
provider receipts only after raw-body signature verification.

GitHub Actions use reviewed immutable commit SHAs, read-only repository
permissions, and checkouts that do not persist the workflow token. Dependabot
keeps those pins current without silently moving a trusted tag.

Out of scope:

- Denial-of-service testing against production.
- Social engineering.
- Spam or content disputes.
- Reports without enough detail to reproduce or evaluate.

## Response

The maintainer will acknowledge credible reports, triage severity, and coordinate
a fix before public disclosure where appropriate.
