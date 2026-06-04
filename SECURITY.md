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

Out of scope:

- Denial-of-service testing against production.
- Social engineering.
- Spam or content disputes.
- Reports without enough detail to reproduce or evaluate.

## Response

The maintainer will acknowledge credible reports, triage severity, and coordinate
a fix before public disclosure where appropriate.
