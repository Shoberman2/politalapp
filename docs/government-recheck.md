# Re-checking the government explainer

`/government` names real people in real jobs. Nothing feeds those names in
automatically, so a scheduled agent re-checks them every month and opens a pull
request. This file is that agent's procedure. A person can follow it too.

## What is checked

| Data | File | Check against |
|---|---|---|
| The 15 department heads, independent agency heads | `src/data/government.js` (`DEPARTMENTS`, `INDEPENDENT_AGENCIES`) | each entry's `headSource`, then whitehouse.gov/administration/the-cabinet |
| Agencies inside each department and who runs them | `src/data/governmentDeep.js` (`DEPARTMENT_DETAIL`) | each component's `headSource` |
| Workforce facts and the per-department employee counts | `governmentDeep.js` (`WORKFORCE_FACTS`), `government.js` (`employees`, `GOV_LADDER`) | data.opm.gov and each fact's `source` |
| Oversight committees | `government.js` (`oversight`) | house.gov/committees and senate.gov/committees. Re-check after each new Congress (next: January 3, 2027) |
| Funding bill, laws | `governmentDeep.js` (`congress`) | appropriations.house.gov subcommittee jurisdiction pages |

Both data files are the source of truth and are edited directly.

## Rules

1. **Never guess a name.** Change a name only when an official page (.gov or
   .mil), a dated Federal Register signature, or a congress.gov nomination
   record shows the new holder. A news report alone may be used only when the
   official site cannot be read, and the entry's `note` must then say the
   month and that it rests on a report.
2. **If a job's holder cannot be confirmed, set `headName` to `null`** and say
   why in one plain sentence in `note`. The page then prints "we could not
   confirm who holds this job".
3. Set `acting: true` for anyone acting, "performing the duties of" or
   "exercising the delegated authority of" the job.
4. Notes are for readers: one or two short sentences, plain words, no em
   dashes, nothing about how the check was done.
5. Update `headSource` to the page actually used.
6. When everything in a file has been re-checked, set its date (`GOV_AS_OF` or
   `GOV_DEEP_AS_OF`) to the day of the check. If only part was checked, leave
   the date alone and list what was skipped in the pull request.
7. Do not change wording, layout, or anything outside these two data files,
   `CHANGELOG.md`, `VERSION` and `package.json` (a patch bump: 4th digit).

## After editing

```
npx vitest run --watch=false test/components/GovernmentPage.test.jsx test/api
node scripts/build-llms-full.mjs
```

Open a pull request titled `chore(government): monthly re-check, <date>`. In
the body list every change as `Job: old holder -> new holder (source URL)`,
every job set to unconfirmed, and everything that could not be checked.

Merge the pull request yourself only when all of these hold; otherwise leave
it open for the founder:

- every changed name is confirmed on an official page or Federal Register
  signature (not a news report);
- no job went from a named holder to `null`;
- the tests pass.

If nothing changed, update the dates, and merge.
