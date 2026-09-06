#!/usr/bin/env npx tsx
/**
 * Repair bills whose real title was overwritten by a vote-derived stub
 * ("HR 1", "S 1582"). Targets bills that have a recorded roll call, fetches
 * the bill detail from Congress.gov, and restores title, introduced date, and
 * policy area. Idempotent; safe to re-run.
 *
 * Usage:
 *   npx tsx etl/repairPlaceholderTitles.ts --dry-run
 *   npx tsx etl/repairPlaceholderTitles.ts
 *   npx tsx etl/repairPlaceholderTitles.ts --all      # every placeholder-titled bill, not only voted-on ones
 *
 * Environment: CONGRESS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { fetchCongressApi, isPlaceholderTitle, loadConfig, logger, retry, chunk } from './utils.js';

interface BillDetailResponse {
  bill?: { title?: string; introducedDate?: string; policyArea?: { name?: string } };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');

async function main(): Promise<void> {
  const config = loadConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });

  // Candidate ids: bills with a roll call (the pages that matter), or every bill.
  let ids: string[] = [];
  if (all) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('bills').select('id, title').order('id').range(from, from + 999);
      if (error) throw new Error(error.message);
      ids.push(...(data || []).filter((b) => isPlaceholderTitle(b.title)).map((b) => b.id));
      if (!data || data.length < 1000) break;
    }
  } else {
    const { data, error } = await supabase.from('roll_calls').select('bill_id').not('bill_id', 'is', null);
    if (error) throw new Error(error.message);
    const distinct = [...new Set((data || []).map((r) => r.bill_id as string))];
    for (const group of chunk(distinct, 200)) {
      const { data: rows, error: e2 } = await supabase.from('bills').select('id, title').in('id', group);
      if (e2) throw new Error(e2.message);
      ids.push(...(rows || []).filter((b) => isPlaceholderTitle(b.title)).map((b) => b.id));
    }
  }
  ids = [...new Set(ids)].sort();
  logger.info(`${ids.length} bills with placeholder titles${all ? '' : ' among voted-on bills'}${dryRun ? ' (dry run)' : ''}`);

  let repaired = 0;
  let missing = 0;
  for (const id of ids) {
    const m = /^(\d+)-([a-z]+)-(\d+)$/.exec(id);
    if (!m) continue;
    const [, congress, type, number] = m;
    try {
      const detail = await retry(() => fetchCongressApi<BillDetailResponse>(`/bill/${congress}/${type}/${number}`, config.congressApiKey));
      const d = detail.bill;
      const title = d?.title?.trim();
      if (!title || isPlaceholderTitle(title)) {
        missing += 1;
        logger.warn(`No title on Congress.gov for ${id}`);
        continue;
      }
      const update: Record<string, unknown> = { title };
      if (d?.introducedDate) update.introduced_at = d.introducedDate;
      if (d?.policyArea?.name?.trim()) update.policy_area = d.policyArea.name.trim();
      if (dryRun) {
        logger.info(`[dry-run] ${id}: "${title}"`);
      } else {
        const { error } = await supabase.from('bills').update(update).eq('id', id);
        if (error) throw new Error(error.message);
        logger.info(`${id}: "${title}"`);
      }
      repaired += 1;
    } catch (err) {
      logger.error(`Failed ${id}`, err);
    }
  }
  logger.info(`Done: ${repaired} ${dryRun ? 'would be repaired' : 'repaired'}, ${missing} without a title on Congress.gov`);
}

main().catch((err) => {
  logger.error('Repair failed', err);
  process.exit(1);
});
