# BallotWatch for iOS

A native SwiftUI app built from the same design system and data as the web app.
It reads the same Supabase tables the React SPA reads, so both clients show the
same numbers.

## Running it

This repo is public, so no API key is committed. Generate your local config
from the repo-root `.env` first:

```bash
ios/scripts/make-secrets.sh   # writes ios/BallotWatch/Secrets.plist (gitignored)
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are required. `CONGRESS_API_KEY` is
optional — without it the app still runs, but House members show their state
instead of a district number, because the Supabase roster stores `district` as
NULL and only Congress.gov can fill it in. Free key at
<https://api.congress.gov/sign-up/>. See `BallotWatch/Secrets.example.plist`.

The Xcode project is generated, not checked in as a hand-edited file. After
cloning or after adding/removing source files:

```bash
cd ios
xcodegen generate          # brew install xcodegen
open BallotWatch.xcodeproj
```

Then build and run against any iOS 17+ simulator or device.

From the command line:

```bash
xcodebuild -project BallotWatch.xcodeproj -scheme BallotWatch \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build

xcodebuild test -project BallotWatch.xcodeproj -scheme BallotWatch \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16 Pro'
```

## What's in it

| Tab | What it does |
|---|---|
| **My Rep** | ZIP or street address → your House member and two senators. Address goes through the Census geocoder for an exact district; a bare ZIP resolves to a state and shows the whole delegation, because ZIPs cross district lines. "Use my location" does the same lookup by coordinate. |
| **Floor** | Every recorded roll call, newest first, with sanity-checked tallies and derived results. Drills into the bill, or into a member-by-member breakdown. |
| **Bills** | Search and browse 180,000+ bills. Server-side search with debounce and pagination. Bill detail carries the official CRS summary, the cached AI explanation, roll-call results with party splits, committee routing, and the sponsor. |
| **Members** | The full roster, filterable by chamber and party, searchable by name or state. Member detail is an article: vote record, independence score, policy breakdown, notable votes, sponsored bills, full voting history. |
| **More** | Account, watched bills, followed members, data provenance, and the methodology page. |

Bills can be watched and members followed without an account — those live in
`UserDefaults`. Signing in (Supabase email auth, tokens in the Keychain) is
optional and only exists to sync them.

## Architecture

No third-party packages. `PostgREST.swift` is a small hand-rolled client
covering the query surface this app uses, which keeps the build dependency-free.

```
BallotWatch/
  Design/       Theme.swift, Typography.swift, Components.swift  ← DESIGN.md, ported
  Models/       Codable models + BillKey/RollCallMeta parsers
  Services/     PostgREST, BallotWatchAPI, FloorVotes, VotingPatterns,
                CongressAPI, DistrictLookup, AuthStore, UserData
  Features/     MyRep, Feed, Bills, Members, More
  Resources/    Fonts, Assets.xcassets
```

### Where the data comes from

- **Supabase (PostgREST)** — `politicians`, `bills`, `votes`, `roll_calls`,
  `roll_call_stats`, `member_stats`, `bill_explanations`,
  `bill_committee_routings`, `etl_metadata`. Read with the public anon key; all
  read policies are "viewable by everyone" because congressional voting records
  are public record.
- **Congress.gov** — district numbers for House members. The Supabase roster
  stores `district` as `NULL` for every House member, so "who holds CA-12" has
  to come from here.
- **US Census Geocoder** — address and coordinate → congressional district.
  (Google's Civic Information Representatives endpoint shut down 2025-04-30.)
- **Supabase Edge Functions** — `explain-bill`, so the OpenAI key stays
  server-side and the generated text is cached for every user.

### Design system

`Design/Theme.swift` and `Design/Typography.swift` are a direct port of
`DESIGN.md`. Instrument Serif for display, General Sans for body and UI, Geist
Mono for anything numeric — all three embedded as app resources rather than
loaded from a CDN. Warm paper (`#FAFAF7`) and warm near-black (`#111110`) in
dark mode; one accent (`#1D4ED8`) used sparingly. Party colors appear only as
small text tags and thin indicator bars, never as card backgrounds.

If a token changes in `DESIGN.md`, change it in `Theme.swift` too.

## Domain rules worth knowing

These are ported from the web services rather than reinvented, and are covered
by unit tests in `BallotWatchTests/DomainTests.swift`:

- **A tally is shown only if it's plausible.** Yea + Nay must be greater than
  zero and no larger than the chamber (435 / 100). Some ingested
  `roll_call_stats` rows double-count party columns; those are suppressed. Where
  the batch job lags, counts are recomputed from individual votes instead.
- **Results use real thresholds.** Cloture needs 60. Suspension of the rules
  needs two-thirds. Nominations and motions to proceed have their own language.
  A tie is reported as a failure.
- **Placeholder bill titles are hidden.** Titles that merely repeat the bill
  number show as the number alone.
- **Independence** counts only Yea/Nay votes where a party breakdown exists.
  Caucusing independents are measured against their caucus (see
  `VotingPatterns.caucusOverrides`, which must stay in sync with
  `src/data/caucusOverrides.js`, `etl/computeStats.ts`, and
  `etl/recomputeRollCallStats.ts`).
- **Seat successions** keep a departing member's votes attributed to them. The
  Senate vote ETL separates a successor from a predecessor who shares their
  surname using first name plus term dates (`resolveSenator` in
  `etl/extractHouseVotes.ts`); resolving by surname alone silently moved 823
  votes onto the wrong senator.

## Tests

36 unit tests over the domain logic, and 6 UI smoke tests that run against the
live backend — the most likely failure in this app is a query shape drifting
from the schema, and a mocked test would never catch that. UI tests assert on
structure, not on specific names or counts, so they don't fail whenever
Congress votes.

UI tests launch the app with `--reset-state` so a saved location from a previous
run doesn't leak into the next.

## Known gaps

- Campaign finance (FEC) and district partisan-lean analysis exist on the web
  but not here — they depend on data files that aren't in Supabase, and
  approximating them on a transparency tool would be worse than omitting them.
- The web app's AI Congress simulation, developer portal, and historical chamber
  are not ported.
