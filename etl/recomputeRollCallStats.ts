/**
 * Recompute `roll_call_stats` rows that disagree with the `votes` table.
 *
 * `roll_call_stats` is a derived aggregate written by `computeStats.ts`. When
 * the underlying votes are repaired (see `repairGrahamVoteAttribution.ts`) the
 * aggregate keeps the stale numbers until the next full ETL run, and the apps
 * read the aggregate — so a corrected vote record still renders the old, failed
 * tally.
 *
 * This recomputes only the rows that actually drifted, straight from `votes`,
 * so it can run in seconds instead of re-ingesting a Congress.
 *
 * Usage:
 *   npx tsx etl/recomputeRollCallStats.ts            # dry run, default
 *   npx tsx etl/recomputeRollCallStats.ts --execute  # apply
 */

import { config as loadEnv } from 'dotenv';

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

type StatsRow = {
  roll_call_id: string;
  dem_yea: number | null; dem_nay: number | null;
  rep_yea: number | null; rep_nay: number | null;
  ind_yea: number | null; ind_nay: number | null;
};

type Tally = { dem_yea: number; dem_nay: number; rep_yea: number; rep_nay: number; ind_yea: number; ind_nay: number };

const PAGE = 1000;

async function rest(path: string, init: RequestInit = {}, write = false): Promise<Response> {
  const key = write ? SERVICE_KEY : (ANON_KEY || SERVICE_KEY);
  if (!SUPABASE_URL || !key) {
    console.error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res;
}

/** Page through a table; PostgREST caps a single response at 1000 rows. */
async function fetchAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await rest(`${path}&limit=${PAGE}&offset=${offset}`);
    const batch = (await res.json()) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/**
 * Independents who caucus with a party are counted in that party's bucket.
 *
 * MUST MATCH `INDEPENDENT_CAUCUS` in `etl/computeStats.ts` and
 * `CAUCUS_OVERRIDES` in `src/data/caucusOverrides.js`. Getting this wrong does
 * not fail loudly — it silently moves two senators between buckets on every
 * roll call they voted on, which reads as ~880 rows of drift.
 */
const INDEPENDENT_CAUCUS: Record<string, 'dem' | 'rep'> = {
  S000033: 'dem', // Bernie Sanders (I-VT)
  K000383: 'dem', // Angus King (I-ME)
};

/**
 * Bucket a member exactly the way `computeStats.ts` does. The roster stores
 * 'Democrat'/'Republican' but the caucus remap produces 'Democratic', so both
 * spellings have to land in the same bucket.
 */
function partyBucket(politicianId: string, party: string): 'dem' | 'rep' | 'ind' {
  const caucus = INDEPENDENT_CAUCUS[politicianId];
  if (caucus) return caucus;
  const p = (party || '').toLowerCase();
  if (p === 'democrat' || p === 'democratic' || p === 'd') return 'dem';
  if (p === 'republican' || p === 'r') return 'rep';
  return 'ind';
}

async function main() {
  const execute = process.argv.includes('--execute');

  const politicians = await fetchAll<{ id: string; party: string }>('politicians?select=id,party');
  const partyById = new Map(politicians.map((p) => [p.id, partyBucket(p.id, p.party)]));

  const votes = await fetchAll<{ roll_call_id: string | null; politician_id: string; position: string }>(
    'votes?select=roll_call_id,politician_id,position&roll_call_id=not.is.null'
  );

  const computed = new Map<string, Tally>();
  for (const v of votes) {
    if (!v.roll_call_id) continue;
    // Only Yea/Nay are broken out by party; Present and Not Voting are not
    // part of this aggregate.
    const key = v.position === 'Yea' ? 'yea' : v.position === 'Nay' ? 'nay' : null;
    if (!key) continue;
    const bucket = partyById.get(v.politician_id);
    if (!bucket) continue;
    const t = computed.get(v.roll_call_id)
      || { dem_yea: 0, dem_nay: 0, rep_yea: 0, rep_nay: 0, ind_yea: 0, ind_nay: 0 };
    t[`${bucket}_${key}` as keyof Tally] += 1;
    computed.set(v.roll_call_id, t);
  }

  const stored = await fetchAll<StatsRow>(
    'roll_call_stats?select=roll_call_id,dem_yea,dem_nay,rep_yea,rep_nay,ind_yea,ind_nay'
  );

  const drifted: Array<{ id: string; from: string; to: string; row: Tally }> = [];
  for (const s of stored) {
    const t = computed.get(s.roll_call_id);
    // No votes ingested for this roll call: leave the stored row alone rather
    // than zeroing a tally we simply can't see.
    if (!t) continue;
    const same =
      (s.dem_yea ?? 0) === t.dem_yea && (s.dem_nay ?? 0) === t.dem_nay &&
      (s.rep_yea ?? 0) === t.rep_yea && (s.rep_nay ?? 0) === t.rep_nay &&
      (s.ind_yea ?? 0) === t.ind_yea && (s.ind_nay ?? 0) === t.ind_nay;
    if (same) continue;
    const sum = (o: any) => (o.dem_yea ?? 0) + (o.dem_nay ?? 0) + (o.rep_yea ?? 0) + (o.rep_nay ?? 0) + (o.ind_yea ?? 0) + (o.ind_nay ?? 0);
    drifted.push({
      id: s.roll_call_id,
      from: `${sum(s)} total`,
      to: `${sum(t)} total`,
      row: t,
    });
  }

  console.log('roll_call_stats recompute');
  console.log('-------------------------');
  console.log(`stored rows:   ${stored.length}`);
  console.log(`computed from: ${votes.length} vote rows across ${computed.size} roll calls`);
  console.log(`drifted rows:  ${drifted.length}`);
  for (const d of drifted.slice(0, 10)) console.log(`  ${d.id}: ${d.from} -> ${d.to}`);
  if (drifted.length > 10) console.log(`  ... and ${drifted.length - 10} more`);

  if (!execute) {
    console.log('\nDry run. Re-run with --execute to apply.');
    return;
  }
  if (drifted.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  const payload = drifted.map((d) => ({ roll_call_id: d.id, ...d.row }));
  for (let i = 0; i < payload.length; i += 500) {
    await rest('roll_call_stats?on_conflict=roll_call_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload.slice(i, i + 500)),
    }, true);
  }
  console.log(`\nUpdated ${payload.length} rows.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
