/**
 * One-off repair for the Senate surname-collision bug fixed in
 * `extractHouseVotes.ts` (`resolveSenator`).
 *
 * The old voter lookup keyed on surname+state and resolved against
 * Congress.gov's *current* members only, so every South Carolina "Graham" vote
 * in the 119th Congress was written under Darline Graham (G000608) — including
 * the ones Lindsey Graham (G000359) cast before she took office.
 *
 * Two distinct kinds of damage, repaired differently:
 *
 *   1. 327 roll calls carry BOTH senators. Positions agree exactly on every
 *      one, which is what you'd expect from a single physical vote written
 *      twice. Darline's copy is deleted.
 *   2. 496 roll calls carry ONLY Darline, for dates before she was seated.
 *      These are Lindsey's votes that never got a correct row, so they are
 *      re-attributed rather than deleted — deleting would erase the vote
 *      instead of fixing who cast it.
 *
 * Rows dated after the handoff are left untouched.
 *
 * Usage:
 *   npx tsx etl/repairGrahamVoteAttribution.ts            # dry run, default
 *   npx tsx etl/repairGrahamVoteAttribution.ts --execute  # apply
 */

import { config as loadEnv } from 'dotenv';

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PREDECESSOR = 'G000359'; // Lindsey Graham, SC, Senate term 2003-2026
const SUCCESSOR = 'G000608';   // Darline Graham, SC, Senate term 2026-

/**
 * Last date the predecessor is recorded voting. Everything the successor holds
 * on or before this belongs to the predecessor; everything after is genuinely
 * theirs. Derived from the data rather than hardcoded to a swearing-in date,
 * because the roll calls are the thing being repaired.
 */
const HANDOFF_DATE = '2026-06-05';

const BATCH = 60; // keep the `in.(...)` URL well under any gateway length cap

type VoteRow = { id: number; roll_call_id: string; position: string; voted_at: string };

function requireEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'This repair writes to the votes table, so it needs the service-role key.'
    );
    process.exit(1);
  }
  return { url: SUPABASE_URL, key: SERVICE_KEY };
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res;
}

async function fetchVotes(politicianId: string): Promise<VoteRow[]> {
  const res = await rest(
    `votes?select=id,roll_call_id,position,voted_at&politician_id=eq.${politicianId}&limit=5000`
  );
  return res.json();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const execute = process.argv.includes('--execute');
  requireEnv();

  const [predecessorRows, successorRows] = await Promise.all([
    fetchVotes(PREDECESSOR),
    fetchVotes(SUCCESSOR),
  ]);

  const predecessorByRollCall = new Map(predecessorRows.map((v) => [v.roll_call_id, v]));
  const misattributed = successorRows.filter((v) => v.voted_at <= HANDOFF_DATE);

  const duplicates = misattributed.filter((v) => predecessorByRollCall.has(v.roll_call_id));
  const orphans = misattributed.filter((v) => !predecessorByRollCall.has(v.roll_call_id));

  // Refuse to touch anything if the two copies ever disagree: that would mean
  // something other than a double-write, and deleting a copy could destroy a
  // real position.
  const conflicts = duplicates.filter(
    (v) => predecessorByRollCall.get(v.roll_call_id)!.position !== v.position
  );

  console.log('Graham vote-attribution repair');
  console.log('------------------------------');
  console.log(`${PREDECESSOR} (predecessor) rows: ${predecessorRows.length}`);
  console.log(`${SUCCESSOR} (successor)   rows: ${successorRows.length}`);
  console.log(`Handoff date: ${HANDOFF_DATE}`);
  console.log(`  misattributed (on/before handoff): ${misattributed.length}`);
  console.log(`    duplicates to delete:            ${duplicates.length}`);
  console.log(`    orphans to re-attribute:         ${orphans.length}`);
  console.log(`  left untouched (after handoff):    ${successorRows.length - misattributed.length}`);
  console.log(`  position conflicts:                ${conflicts.length}`);

  if (conflicts.length > 0) {
    console.error('\nABORT: the two senators disagree on these roll calls:');
    for (const c of conflicts.slice(0, 20)) {
      console.error(
        `  ${c.roll_call_id}: ${PREDECESSOR}=${predecessorByRollCall.get(c.roll_call_id)!.position} ` +
        `${SUCCESSOR}=${c.position}`
      );
    }
    console.error('Investigate before repairing — this is not a simple double-write.');
    process.exit(1);
  }

  if (!execute) {
    console.log('\nDry run. Re-run with --execute to apply.');
    console.log(`Projected result: ${PREDECESSOR} -> ${predecessorRows.length + orphans.length} rows, ` +
      `${SUCCESSOR} -> ${successorRows.length - misattributed.length} rows.`);
    return;
  }

  // Snapshot before mutating, so the change is reversible from the log.
  console.log('\nBACKUP (row ids being changed):');
  console.log(JSON.stringify({
    deleted: duplicates.map((v) => ({ id: v.id, roll_call_id: v.roll_call_id, position: v.position })),
    reattributed: orphans.map((v) => ({ id: v.id, roll_call_id: v.roll_call_id, position: v.position })),
  }));

  let deleted = 0;
  for (const group of chunk(duplicates.map((v) => v.id), BATCH)) {
    await rest(`votes?id=in.(${group.join(',')})`, { method: 'DELETE' });
    deleted += group.length;
    process.stdout.write(`\r  deleted ${deleted}/${duplicates.length}`);
  }
  if (duplicates.length) console.log('');

  let moved = 0;
  for (const group of chunk(orphans.map((v) => v.id), BATCH)) {
    await rest(`votes?id=in.(${group.join(',')})`, {
      method: 'PATCH',
      body: JSON.stringify({ politician_id: PREDECESSOR }),
    });
    moved += group.length;
    process.stdout.write(`\r  re-attributed ${moved}/${orphans.length}`);
  }
  if (orphans.length) console.log('');

  const [afterPredecessor, afterSuccessor] = await Promise.all([
    fetchVotes(PREDECESSOR),
    fetchVotes(SUCCESSOR),
  ]);
  console.log('\nDone.');
  console.log(`  ${PREDECESSOR}: ${predecessorRows.length} -> ${afterPredecessor.length}`);
  console.log(`  ${SUCCESSOR}: ${successorRows.length} -> ${afterSuccessor.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
