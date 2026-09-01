# Forecast data provenance gate

Status: **NO-GO for model training and public forecasts.** The A0 storage,
parser, and validation foundation may run, but the historical corpus may not be
promoted into an evaluation dataset until every blocking source below is fixed.

## Release rule

A corpus is eligible for chronological model development only when at least 95%
of its rows have exact, timestamped pre-vote provenance. The untouched final-test
split requires 100% exact provenance. Rows with a documented
`synthetic_conservative` cutoff may be used for exploratory training only; they
never count toward either release threshold.

No model, metric, or forecast UI may be published merely because it performs
well on ineligible data.

## Source inventory

| Feature/source | Current evidence | Quality | Decision |
|---|---|---:|---|
| Official member vote and vote date | House Clerk/Senate roll-call records are ingested with official source URLs and member-level positions. | Exact after the atomic tally and roster checks pass | Allowed |
| Normalized vote target | Versioned parser preserves raw text and appends a new parse for every parser version. Unknown or unsupported questions fail closed. | Exact for preserved source text; interpretation is versioned | Allowed |
| Member effective interval | Current Congress.gov member loading uses the Congress start date and commonly leaves `term_end` null. That cannot prove resignations, appointments, or party changes on an exact day. | Insufficient | **Blocked** |
| Historical schedule publication cutoff | The current House schedule collector captures the current/next week. It does not provide a verified archive of the publication timestamp for every historical scheduled vote. | Missing for the historical corpus | **Blocked** |
| Bill title and policy area | Congress.gov values can be revised after introduction. The current rows do not preserve the exact revision available at every forecast cutoff. | Mutable snapshot | Blocked as cutoff features until revision capture exists |
| Cosponsors | Cosponsors change over time; the current table is not a complete as-of ledger for each forecast cutoff. | Mutable snapshot | Blocked as cutoff features until timestamped history exists |
| Prior member votes | Eligible only when `voted_at` is strictly before the feature cutoff and the parent roll call has `member_votes_complete_at`. | Derivable exactly after A0 checks | Conditionally allowed |
| Synthetic cutoff | A conservative timestamp chosen before `voted_at`, with the rule and revision recorded. | Synthetic | Exploratory training only |

## Required evidence before GO

1. Import an authoritative member service-history source with exact inclusive
   start/end dates, chamber, party/caucus, and a stable source revision. Reject
   overlaps and unresolved identity mappings.
2. Acquire or build an official, revision-preserving schedule archive that can
   prove when each target first became publicly scheduled. Store the captured
   bytes, retrieval time, source publication time, parser version, and SHA-256.
3. Preserve as-of revisions for every mutable bill or sponsorship feature used
   by a model. If that cannot be proven, omit the feature.
4. Produce a machine-readable coverage report. The gate implementation must
   report exact, synthetic, and unusable rows separately and enforce 95% exact
   coverage for the corpus and 100% for the untouched final test.
5. Run chronological leakage tests, roster/tally checks, and deterministic
   snapshot-hash tests against the immutable extracted dataset.

## Operational contract

`persist_historical_roll_call` is the only approved path for marking a roll call
complete during historical ingestion. It holds a fenced ETL lease and writes the
roll call, versioned target parse, complete member vote set, source-tally check,
completion timestamp, and resumable checkpoint in one transaction. A stale
fence, unresolved member interval, duplicate member/House seat, malformed vote,
conflicting retry, extra stored member, or tally mismatch aborts the transaction.

Canonical feature builders reject source revisions newer than the feature
cutoff, sort keys and rows with locale-independent ordering, normalize Unicode,
reject non-finite values, and hash the exact stored representation. These are
necessary controls, but they do not change the current NO-GO decision.
