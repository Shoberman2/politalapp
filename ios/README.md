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

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are the only values. Congress.gov and
OpenFEC are reached through the site's proxy (`https://www.ballotwatch.io/api/proxy/*`,
`api/_lib/upstreamProxy.js`), so their keys never ship in the app. A new
upstream call needs an allow-list entry there. See
`BallotWatch/Secrets.example.plist`.

### BallotWatch Pro and sign-in keys

- **RevenueCat:** `Config/BallotWatch.xcconfig` holds `REVENUECAT_API_KEY =
  REVENUECAT_API_KEY_PLACEHOLDER`. Put the real public SDK key (`appl_...`) in
  `Config/Secrets.local.xcconfig` (gitignored), never in the committed file.
  While the placeholder is in place the app uses StoreKit 2 directly.
- **Local purchases:** the scheme runs with `BallotWatch/BallotWatch.storekit`
  (monthly `io.ballotwatch.pro.monthly` $4.99, yearly `io.ballotwatch.pro.yearly`
  $39.99, one group, one-week free trial on each), so the paywall and purchases
  work in the simulator before App Store Connect is set up.
- **Sign in with Apple:** enable the Apple provider in Supabase Auth and add
  `io.ballotwatch.app` as an authorized client ID. The app exchanges Apple's
  identity token at `/auth/v1/token?grant_type=id_token`.
- **Launch arguments** (for tests and screenshots): `--reset-state`,
  `--skip-onboarding`, `--onboarding`, `--pro-preview`, `--appearance dark`.

The Xcode project is generated, not checked in as a hand-edited file. After
cloning or after adding/removing source files:

```bash
cd ios
xcodegen generate          # brew install xcodegen
open BallotWatch.xcodeproj
```

Then build and run against any iOS 17+ simulator or device.
For a physical device, select the **BallotWatch** target in Xcode and choose
your Apple Development team under **Signing & Capabilities**. XcodeGen leaves
the team unset so each developer can use their own account; automatic signing
remains enabled.

From the command line:

```bash
xcodebuild -project BallotWatch.xcodeproj -scheme BallotWatch \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' build

xcodebuild test -project BallotWatch.xcodeproj -scheme BallotWatch \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max'

# Physical device (replace the placeholders with your values)
xcodebuild -project BallotWatch.xcodeproj -scheme BallotWatch \
  -destination 'platform=iOS,id=<device-udid>' \
  DEVELOPMENT_TEAM=<team-id> -allowProvisioningUpdates build
```

## What's in it

| Tab | What it does |
|---|---|
| **My Rep** | ZIP or street address → your House member and two senators. Address goes through the Census geocoder for an exact district; a bare ZIP resolves to a state and shows the whole delegation, because ZIPs cross district lines. "Use my location" does the same lookup by coordinate. |
| **Floor** | Every recorded roll call, newest first, with sanity-checked tallies and derived results. Drills into the bill, or into a member-by-member breakdown. |
| **Bills** | Search and browse 180,000+ bills. Server-side search with debounce and pagination. Bill detail carries the official CRS summary, the cached AI explanation, roll-call results with party splits, committee routing, and the sponsor. |
| **Members** | The full roster, filterable by chamber and party, searchable by name or state. Member detail is an article: vote record, independence score, policy breakdown, notable votes, sponsored bills, full voting history. |
| **More** | Account and settings (a sheet), Ask Dome, watched bills, followed members, data provenance, and the methodology page. |

First launch opens on a short chat with **Dome** (the Capitol mark with eyes):
where you vote, follow your members, alerts, and an optional account.

### Free and Pro

Everything public is free and never paywalled: rep lookup, the floor, bills,
votes, member records and campaign finance. **BallotWatch Pro** ($4.99 a month
or $39.99 a year, entitlement `pro`) adds:

| Feature | Where |
|---|---|
| Bill Watch alerts, any number of bills | Bell on a bill |
| Member vote alerts | Bell on a member |
| Ask Dome (answers from the record, with sources) | More > Ask Dome; `POST /api/ask` on the site |
| District map and member comparisons | My Reps > District map; member ... menu |
| CSV export of a member's votes | Member ... menu |

The paywall shows price, period, trial and auto-renew terms, Terms and Privacy
links and Restore Purchases. RevenueCat's appUserID is the Supabase user ID.

### What still needs a server

Push registration is client-side only: the app asks permission, registers with
APNs and keeps the device token and alert choices on the device
(`Services/AlertsStore.swift`). Delivering alerts needs a table for device
tokens and alert choices, the APNs key, and a job that sends on bill actions
and new roll calls. None of that is in this branch.

`/api/ask` checks the RevenueCat `pro` entitlement once `REVENUECAT_SECRET_KEY`
is set on Vercel; until then any signed-in account may ask, 20 questions a day.

Bills can be watched and members followed without an account; those live in
`UserDefaults`. Signing in (Sign in with Apple or email through Supabase,
tokens in the Keychain) is optional: it syncs them and carries Pro. Account
deletion is in the settings sheet (`delete-account` Edge Function).

## Architecture

One third-party package: RevenueCat (SPM), for subscriptions. `PostgREST.swift`
is a small hand-rolled client covering the query surface this app uses.

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
- **Congress.gov** (via the site proxy) — district numbers for House members.
  The Supabase roster stores `district` as `NULL` for every House member, so
  "who holds CA-12" has to come from here.
- **OpenFEC** (via the site proxy) — campaign-finance totals and receipts.
- **US Census Geocoder** — address and coordinate → congressional district.
  (Google's Civic Information Representatives endpoint shut down 2025-04-30.)
- **Supabase Edge Functions** — `explain-bill`, so the OpenAI key stays
  server-side and the generated text is cached for every user.

### Design system

`Design/Theme.swift` and `Design/Typography.swift` are a direct port of
`DESIGN.md`. Inter for everything readable (Inter Display 600 for headlines,
no serif, no italic accents) and Geist Mono for anything numeric — both
embedded as app resources rather than loaded from a CDN. Warm paper (`#FAFAF7`) and warm near-black (`#111110`) in
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

71 unit tests over the domain logic and the Pro plumbing, and 6 UI smoke tests that run against the
live backend — the most likely failure in this app is a query shape drifting
from the schema, and a mocked test would never catch that. UI tests assert on
structure, not on specific names or counts, so they don't fail whenever
Congress votes.

UI tests launch the app with `--reset-state --skip-onboarding` so a saved
location from a previous run doesn't leak into the next.

`ScreenshotTests` walks every Pro, auth and onboarding screen and saves PNGs.
It is skipped unless `SHOTDIR` is set:

```bash
TEST_RUNNER_SHOTDIR=~/ios-shots/ballotwatch TEST_RUNNER_APPEARANCE=dark \
  xcodebuild test -project BallotWatch.xcodeproj -scheme BallotWatch \
  -destination 'platform=iOS Simulator,name=iPhone SE (3rd generation)' \
  -only-testing:BallotWatchUITests/ScreenshotTests
```

## Known gaps

- District partisan-lean analysis exists on the web but not here — it depends
  on data files that aren't in Supabase, and approximating it on a
  transparency tool would be worse than omitting it.
- The web app's AI Congress simulation, developer portal, and historical chamber
  are not ported.
