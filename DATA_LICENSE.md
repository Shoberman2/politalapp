# BallotWatch Data License: CC0 1.0 Universal

To the extent possible under law, the BallotWatch contributors have waived all
copyright and related or neighboring rights to the **BallotWatch-derived data**
described below, by dedicating it to the public domain under the
[Creative Commons CC0 1.0 Universal Public Domain Dedication](https://creativecommons.org/publicdomain/zero/1.0/).

Full legal code: <https://creativecommons.org/publicdomain/zero/1.0/legalcode>

## What this covers

- The bulk open-data files published at `https://www.ballotwatch.io/data/full/`
  and `https://www.ballotwatch.io/data/archive/{date}/` (members, member terms,
  bills, bill cosponsors, roll calls, votes; CSV and NDJSON), their
  `manifest.json` and `datapackage.json`, and the same records returned by
  `/api/v1/*` and the MCP server at `/mcp`.
- BallotWatch's selection, arrangement, ids, URLs and derived fields in that
  data, such as a roll call's `result` (computed from the tally and the
  question) and the tally sanity check.
- The sample files in `public/data/`.

You can copy, modify, distribute, sell, and use the data for any purpose,
including training or grounding AI systems, without asking permission.

## The underlying records

The source records come from Congress.gov (Library of Congress), the Office of
the Clerk of the U.S. House of Representatives, and the U.S. Senate. As works
of the U.S. federal government they are generally in the public domain in the
United States (17 U.S.C. § 105). CC0 does not change their status.

## What this does not cover

- **Code.** The BallotWatch source code is licensed under the MIT License; see
  [`LICENSE`](LICENSE).
- **Trademarks and branding.** CC0 does not grant rights to the BallotWatch
  name or logo, and does not imply endorsement.
- **AI-written text.** Plain-English bill explanations, summaries and other
  generated text are not part of the bulk files, and this dedication does not
  extend to them, even where the API returns them. (The official CRS summaries
  they are written from are federal works.)
- **Third-party material** that is not in the bulk files, such as member photos
  hosted by others, and campaign-finance data read live from the FEC.

## Attribution (optional, appreciated)

Attribution is not required. If you want to credit the source:

> BallotWatch open data, snapshot YYYY-MM-DD. https://www.ballotwatch.io/data/full/
> (CC0 1.0). Source records: Congress.gov, Office of the Clerk of the U.S. House,
> U.S. Senate.

The snapshot date is `snapshot_date` in `manifest.json`.

## No warranty

The data is provided as is, without warranty of any kind. Official records can
be corrected after first publication; check the `source_url` on any record you
rely on, and report errors at
<https://github.com/Shoberman2/politalapp/issues/new?template=data_correction.yml>.
