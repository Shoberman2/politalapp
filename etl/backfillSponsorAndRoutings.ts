/**
 * Backfill Sponsor + Routings (one-time)
 *
 * Two phases (per plan):
 *
 *   Phase A (current Congress only, ~1.5K bills):
 *     For every bill currently in the `bills` table whose sponsor_bioguide_id
 *     is null, fetch the Congress.gov detail + committees + cosponsors and
 *     populate sponsor cols, bill_committee_routings, and bill_cosponsors.
 *     ~5 min ETL.
 *
 *   Phase B (historical, 117th + 118th, ~40K bills, ~8h throttled):
 *     For every bill in the 117th or 118th Congress, fetch detail just for
 *     committee routings (no sponsor or cosponsor data — kept lean for older
 *     Congresses where survival math is the only consumer).
 *     Writes backfill_state('phase_b_routings_backfill', 'running') at start
 *     and ('complete') at end so computeCommitteeSurvival skips while in flight.
 *
 * Usage:
 *   npx tsx etl/backfillSponsorAndRoutings.ts --phase a       (default)
 *   npx tsx etl/backfillSponsorAndRoutings.ts --phase b
 *   npx tsx etl/backfillSponsorAndRoutings.ts --phase a --limit 100
 *   npx tsx etl/backfillSponsorAndRoutings.ts --phase a --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { fetchCongressApi, loadConfig, logger, retry } from './utils.js';
import { deriveLegislativeStage } from '../shared/legislativeStage.js';
import { lookupCommittee } from './data/committees.js';

interface CliOptions {
  phase: 'a' | 'b';
  limit: number;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const phaseIdx = args.indexOf('--phase');
  const phase = (phaseIdx >= 0 ? args[phaseIdx + 1]?.toLowerCase() : 'a') as 'a' | 'b';
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const dryRun = args.includes('--dry-run');
  if (phase !== 'a' && phase !== 'b') {
    console.error('Usage: --phase a | --phase b');
    process.exit(2);
  }
  return { phase, limit, dryRun };
}

interface SponsorItem {
  bioguideId?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  party?: string;
  state?: string;
}
interface CommitteeActivity { name?: string; date?: string }
interface CommitteeItem {
  systemCode?: string;
  name?: string;
  chamber?: string;
  type?: string;
  activities?: CommitteeActivity[];
  subcommittees?: Array<{ systemCode?: string; name?: string; activities?: CommitteeActivity[] }>;
}
interface CosponsorItem {
  bioguideId?: string;
  sponsorshipDate?: string;
  sponsorshipWithdrawnDate?: string;
}

function mapActivityType(name: string | undefined | null): string {
  if (!name) return 'referred_to';
  const lower = name.toLowerCase();
  if (lower.includes('reported')) return 'reported_by';
  if (lower.includes('discharged')) return 'discharged_from';
  if (lower.includes('markup')) return 'markup';
  if (lower.includes('consideration')) return 'committee_consideration';
  return 'referred_to';
}

function parseBillId(id: string): { congress: number; type: string; number: number } | null {
  const m = /^(\d+)-([a-z]+)-(\d+)$/i.exec(id);
  if (!m) return null;
  return {
    congress: parseInt(m[1], 10),
    type: m[2].toLowerCase(),
    number: parseInt(m[3], 10),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const config = loadConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logger.info(`Backfill starting: phase=${opts.phase} limit=${opts.limit} dryRun=${opts.dryRun}`);

  // --------- Phase B: sentinel start ---------
  if (opts.phase === 'b' && !opts.dryRun) {
    await supabase
      .from('backfill_state')
      .upsert(
        {
          name: 'phase_b_routings_backfill',
          status: 'running',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'name', ignoreDuplicates: false }
      );
    logger.info('Wrote backfill_state(phase_b_routings_backfill, running)');
  }

  try {
    // --------- Select target bills ---------
    let billsQuery = supabase.from('bills').select('id').order('id', { ascending: true });
    if (opts.phase === 'a') {
      // Phase A: current Congress (119th) only, ONLY rows that haven't been enriched yet.
      billsQuery = billsQuery.like('id', '119-%').is('sponsor_bioguide_id', null);
    } else {
      // Phase B: 117th + 118th. Use .or() for the two prefixes.
      billsQuery = billsQuery.or('id.like.117-%,id.like.118-%');
    }
    const { data: billRows, error: billErr } = await billsQuery;
    if (billErr) throw billErr;
    if (!billRows) {
      logger.warn('No bills returned for backfill');
      return;
    }

    const targets = billRows.slice(0, opts.limit);
    logger.info(`Backfilling ${targets.length} bills (of ${billRows.length} candidates)`);

    let done = 0;
    let routingsWritten = 0;
    let cosponsorsWritten = 0;
    let sponsorsWritten = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const row of targets) {
      const billId = (row as any).id as string;
      const parsed = parseBillId(billId);
      if (!parsed) {
        logger.warn(`Unparseable bill id: ${billId}`);
        continue;
      }
      const { congress, type, number } = parsed;

      try {
        // --------- Detail fetch (sponsor + latestAction → stage) — Phase A only ---------
        let sponsorPatch: Record<string, unknown> | null = null;
        if (opts.phase === 'a') {
          const detail = await retry(() =>
            fetchCongressApi<{ bill?: { sponsors?: SponsorItem[]; latestAction?: { text?: string } } }>(
              `/bill/${congress}/${type}/${number}`,
              config.congressApiKey
            )
          );
          const b = detail.bill;
          if (b) {
            const sponsor = b.sponsors?.[0];
            sponsorPatch = {
              sponsor_bioguide_id: sponsor?.bioguideId ?? null,
              sponsor_name:
                sponsor?.fullName ??
                (sponsor?.firstName || sponsor?.lastName
                  ? `${sponsor.firstName ?? ''} ${sponsor.lastName ?? ''}`.trim()
                  : null),
              sponsor_party: sponsor?.party ?? null,
              sponsor_state: sponsor?.state ?? null,
              legislative_stage: deriveLegislativeStage(b.latestAction?.text ?? null),
            };
          }
        }

        // --------- Committees (BOTH phases) ---------
        const committeesRes = await retry(() =>
          fetchCongressApi<{ committees?: CommitteeItem[] }>(
            `/bill/${congress}/${type}/${number}/committees`,
            config.congressApiKey
          )
        );
        const committees = committeesRes.committees ?? [];

        // --------- Cosponsors (Phase A only) ---------
        let cosponsors: CosponsorItem[] = [];
        if (opts.phase === 'a') {
          const cospRes = await retry(() =>
            fetchCongressApi<{ cosponsors?: CosponsorItem[] }>(
              `/bill/${congress}/${type}/${number}/cosponsors`,
              config.congressApiKey
            )
          );
          cosponsors = cospRes.cosponsors ?? [];
        }

        // --------- Write sponsor patch (Phase A) ---------
        if (sponsorPatch && !opts.dryRun) {
          const { error: updErr } = await supabase
            .from('bills')
            .update(sponsorPatch)
            .eq('id', billId);
          if (updErr) {
            logger.warn(`Sponsor patch failed for ${billId}: ${updErr.message}`);
          } else if (sponsorPatch.sponsor_bioguide_id) {
            sponsorsWritten++;
          }
        }

        // --------- Write routings ---------
        const routingRows: Array<Record<string, unknown>> = [];
        for (const c of committees) {
          const committeeCode = c.systemCode?.toUpperCase();
          if (!committeeCode) continue;
          const firstAct = c.activities?.[0];
          const referredAt = firstAct?.date ?? null;
          const activityType = mapActivityType(firstAct?.name);
          const subs = c.subcommittees ?? [];

          // Glossary check → log unknown codes (best-effort, fire-and-forget).
          if (!lookupCommittee(committeeCode) && !opts.dryRun) {
            await supabase
              .from('unknown_committee_codes')
              .upsert(
                {
                  committee_code: committeeCode,
                  subcommittee_code: null,
                  first_seen_at: new Date().toISOString(),
                  last_seen_at: new Date().toISOString(),
                  occurrence_count: 1,
                },
                { onConflict: 'committee_code', ignoreDuplicates: true }
              );
          }

          if (subs.length === 0) {
            routingRows.push({
              bill_id: billId,
              committee_code: committeeCode,
              committee_name: c.name ?? null,
              subcommittee_code: null,
              subcommittee_name: null,
              chamber: c.chamber ?? null,
              referred_at: referredAt,
              activity_type: activityType,
            });
          } else {
            for (const s of subs) {
              const subCode = s.systemCode?.toUpperCase() ?? null;
              const subFirst = s.activities?.[0];
              routingRows.push({
                bill_id: billId,
                committee_code: committeeCode,
                committee_name: c.name ?? null,
                subcommittee_code: subCode,
                subcommittee_name: s.name ?? null,
                chamber: c.chamber ?? null,
                referred_at: subFirst?.date ?? referredAt,
                activity_type: mapActivityType(subFirst?.name),
              });
            }
          }
        }

        if (routingRows.length > 0 && !opts.dryRun) {
          const { error: routErr } = await supabase
            .from('bill_committee_routings')
            .upsert(routingRows, {
              onConflict: 'bill_id,committee_code,subcommittee_code',
              ignoreDuplicates: false,
            });
          if (routErr) {
            logger.warn(`Routings upsert failed for ${billId}: ${routErr.message}`);
          } else {
            routingsWritten += routingRows.length;
          }
        }

        // --------- Write cosponsors (Phase A only) ---------
        if (opts.phase === 'a' && cosponsors.length > 0 && !opts.dryRun) {
          const cospRows = cosponsors
            .filter((cs) => cs.bioguideId)
            .map((cs) => ({
              bill_id: billId,
              bioguide_id: cs.bioguideId!,
              cosponsored_at: cs.sponsorshipDate ?? null,
              withdrawn_at: cs.sponsorshipWithdrawnDate ?? null,
            }));
          if (cospRows.length > 0) {
            const { error: cospErr } = await supabase
              .from('bill_cosponsors')
              .upsert(cospRows, {
                onConflict: 'bill_id,bioguide_id',
                ignoreDuplicates: false,
              });
            if (cospErr) {
              logger.warn(`Cosponsors upsert failed for ${billId}: ${cospErr.message}`);
            } else {
              cosponsorsWritten += cospRows.length;
            }
          }
        }

        done++;
        if (done % 50 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          logger.info(
            `Progress: ${done}/${targets.length} bills · ${sponsorsWritten} sponsors · ${routingsWritten} routings · ${cosponsorsWritten} cosponsors · ${failed} failed · ${elapsed}s elapsed`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed++;
        logger.warn(`Backfill failed for ${billId}: ${message}`);
        // Continue with the next bill; one detail failure shouldn't stop the run.
      }
    }

    logger.info(
      `Backfill complete: ${done}/${targets.length} bills processed · ${sponsorsWritten} sponsors · ${routingsWritten} routings · ${cosponsorsWritten} cosponsors · ${failed} failed`
    );
  } finally {
    // --------- Phase B: sentinel complete ---------
    if (opts.phase === 'b' && !opts.dryRun) {
      await supabase
        .from('backfill_state')
        .update({
          status: 'complete',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('name', 'phase_b_routings_backfill');
      logger.info('Wrote backfill_state(phase_b_routings_backfill, complete)');
    }
  }
}

main().catch((err) => {
  logger.error('Backfill failed at top level', err);
  process.exit(1);
});
