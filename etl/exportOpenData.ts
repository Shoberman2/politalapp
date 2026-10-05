/**
 * Open-data snapshot exporter.
 *
 * Reads every public congressional table with the service-role client (paged,
 * no row caps) and writes, for the full archive and for the current Congress:
 *
 *   members, member_terms, bills, bill_cosponsors, roll_calls, votes
 *
 * each as gzip CSV (.csv.gz) and gzip NDJSON (.ndjson.gz), plus manifest.json
 * (row counts, byte sizes, sha256) and a Frictionless datapackage.json. The
 * catalog of tables and fields lives in shared/openData.js.
 *
 * Usage:
 *   npx tsx etl/exportOpenData.ts                 # write ./dist-data only
 *   npx tsx etl/exportOpenData.ts --upload        # and upload to Storage
 *   npx tsx etl/exportOpenData.ts --out some/dir --congress 119
 *
 * --upload puts the files in the public Supabase Storage bucket `open-data`
 * (created if missing, public read) under latest/ and a dated YYYY-MM-DD/
 * prefix, then deletes dated snapshots beyond the newest 14. The site serves
 * latest/ at https://www.ballotwatch.io/data/full/ (vercel.json rewrite).
 *
 * Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (the same secrets the
 * daily ETL workflow already has). Never prints either value.
 *
 * License of the output: CC0 1.0 (see DATA_LICENSE.md).
 */

import { createClient } from '@supabase/supabase-js';
import { createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { join, resolve } from 'node:path';
import { PLACEHOLDER_TITLE_RE } from './utils.js';
// Plain-JS helpers shared with the API, so the files and the site agree on
// which tallies are trusted and what each result word is.
// @ts-ignore -- untyped JS module
import { parseRollCallId, saneTally, tallyFromStats, deriveResult, rollCallPath } from '../api/_lib/rollCallResult.js';
import {
  OPEN_DATA_TABLES,
  OPEN_DATA_FORMATS,
  OPEN_DATA_BUCKET,
  OPEN_DATA_BASE_URL,
  OPEN_DATA_ARCHIVE_PATH,
  SITE_ORIGIN,
  LATEST_PREFIX,
  KEEP_DATED_SNAPSHOTS,
  DATA_LICENSE,
  DATA_SOURCES,
  ATTRIBUTION,
  CITATION,
  UPDATE_CADENCE,
  MANIFEST_URL,
  DATAPACKAGE_URL,
  fileName,
  resourceName,
  currentCongress,
} from '../shared/openData.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;
type Row = Record<string, unknown>;
type Scope = 'all' | 'congress';

export const PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface PaginateOptions {
  /** Columns to ORDER BY (a unique key, so offset paging is stable). */
  orderBy: string[];
  pageSize?: number;
  /**
   * Keyset paging on one unique, increasing column (e.g. votes.id). Deep
   * OFFSETs over ~400k rows get slow; `id > last` stays an index seek.
   */
  keyset?: string;
}

/**
 * Yields every row of `table`, one page at a time. Offset mode advances by the
 * rows actually returned (not the page size), so a server-side max-rows cap
 * smaller than `pageSize` cannot silently skip rows, and stops only on an
 * empty page.
 */
export async function* paginate(client: Client, table: string, columns: string, opts: PaginateOptions): AsyncGenerator<Row[]> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  if (opts.keyset) {
    const key = opts.keyset;
    let last: unknown = null;
    for (;;) {
      let q = client.from(table).select(columns).order(key, { ascending: true }).limit(pageSize);
      if (last !== null) q = q.gt(key, last);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!data || data.length === 0) return;
      yield data;
      last = data[data.length - 1][key];
    }
  }
  let from = 0;
  for (;;) {
    let q = client.from(table).select(columns);
    for (const col of opts.orderBy) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw Object.assign(new Error(`${table}: ${error.message}`), { code: error.code });
    if (!data || data.length === 0) return;
    yield data;
    from += data.length;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** RFC 4180 field: null/undefined -> empty; quote when needed; double quotes. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvLine(values: unknown[]): string {
  return values.map(csvEscape).join(',') + '\n';
}

function dateOnly(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : null;
}

function emptyToNull(v: unknown): unknown {
  return v === '' || v === undefined ? null : v;
}

export function isPlaceholder(title: unknown): boolean {
  const t = String(title ?? '').trim();
  return t.length === 0 || PLACEHOLDER_TITLE_RE.test(t);
}

/** "119-hr-1" -> { congress: 119, type: 'hr', number: 1 } */
export function parseBillId(id: string): { congress: number; type: string; number: number } | null {
  const m = /^(\d+)-([a-z]+)-(\d+)$/.exec(String(id || '').toLowerCase());
  return m ? { congress: Number(m[1]), type: m[2], number: Number(m[3]) } : null;
}

export function billRow(b: Row): Row | null {
  const p = parseBillId(String(b.id));
  if (!p) return null;
  return {
    id: b.id,
    congress: p.congress,
    type: p.type,
    number: p.number,
    title: isPlaceholder(b.title) ? null : String(b.title).trim(),
    introduced_at: dateOnly(b.introduced_at),
    policy_area: emptyToNull(b.policy_area),
    legislative_stage: emptyToNull(b.legislative_stage),
    sponsor_bioguide_id: emptyToNull(b.sponsor_bioguide_id),
    sponsor_name: emptyToNull(b.sponsor_name),
    sponsor_party: emptyToNull(b.sponsor_party),
    sponsor_state: emptyToNull(b.sponsor_state),
    page_url: `${SITE_ORIGIN}/bill/${p.congress}/${p.type}/${p.number}`,
    source_url: emptyToNull(b.source_url),
  };
}

interface StatsRow { dem_yea?: number; dem_nay?: number; rep_yea?: number; rep_nay?: number; ind_yea?: number; ind_nay?: number }

/**
 * One roll-call row. Tallies come from roll_call_stats; when the total is
 * empty or exceeds the chamber's seats (double-counted ETL rows) every tally
 * column and the result are null rather than wrong.
 */
export function rollCallRow(id: string, rc: Row | undefined, stats: StatsRow | undefined, fallback: { voted_at?: string | null; source_url?: string | null } = {}): Row | null {
  const p = parseRollCallId(id);
  if (!p) return null;
  const { yea, nay } = tallyFromStats(stats);
  const sane = Boolean(stats) && saneTally(yea, nay, p.chamber);
  const question = (rc?.question as string) ?? null;
  const description = (rc?.description as string) ?? null;
  return {
    id,
    chamber: p.chamberKey,
    congress: p.congress,
    session: p.session,
    roll: p.roll,
    voted_at: dateOnly(rc?.voted_at) ?? dateOnly(fallback.voted_at),
    question: emptyToNull(question),
    description: emptyToNull(description),
    bill_id: emptyToNull(rc?.bill_id),
    yea: sane ? yea : null,
    nay: sane ? nay : null,
    dem_yea: sane ? stats!.dem_yea ?? 0 : null,
    dem_nay: sane ? stats!.dem_nay ?? 0 : null,
    rep_yea: sane ? stats!.rep_yea ?? 0 : null,
    rep_nay: sane ? stats!.rep_nay ?? 0 : null,
    ind_yea: sane ? stats!.ind_yea ?? 0 : null,
    ind_nay: sane ? stats!.ind_nay ?? 0 : null,
    result: sane ? deriveResult(question, yea, nay, p.chamber, description) : null,
    page_url: `${SITE_ORIGIN}${rollCallPath(id)}`,
    source_url: fallback.source_url ?? null,
  };
}

/** Natural order: chamber, congress, session, roll. */
export function compareRollCallIds(a: string, b: string): number {
  const pa = parseRollCallId(a)!;
  const pb = parseRollCallId(b)!;
  return pa.chamberKey.localeCompare(pb.chamberKey) || pa.congress - pb.congress || pa.session - pb.session || pa.roll - pb.roll;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface FileEntry {
  path: string;
  table: string;
  scope: Scope;
  congress: number | null;
  format: string;
  mediatype: string;
  encoding: 'gzip';
  rows: number;
  bytes: number;
  sha256: string;
  url: string;
}

class GzipFile {
  private gz = createGzip({ level: 9 });
  private out;
  constructor(readonly absPath: string) {
    this.out = createWriteStream(absPath);
    this.gz.pipe(this.out);
  }
  async write(s: string) {
    if (!this.gz.write(s)) await once(this.gz, 'drain');
  }
  async close() {
    this.gz.end();
    await finished(this.out);
  }
}

/** One table in one scope: a CSV and an NDJSON file written side by side. */
export class TableWriter {
  rows = 0;
  private csv: GzipFile;
  private ndjson: GzipFile;
  private names: string[];
  constructor(private outDir: string, readonly table: string, readonly scope: Scope, readonly congress: number) {
    const spec = OPEN_DATA_TABLES.find((t) => t.table === table);
    if (!spec) throw new Error(`unknown table ${table}`);
    this.names = spec.fields.map((x) => x.name);
    this.csv = new GzipFile(join(outDir, fileName(table, scope, congress, 'csv')));
    this.ndjson = new GzipFile(join(outDir, fileName(table, scope, congress, 'ndjson')));
  }
  private ready = false;
  async write(row: Row) {
    if (!this.ready) { await this.csv.write(csvLine(this.names)); this.ready = true; }
    const ordered: Row = {};
    for (const n of this.names) ordered[n] = row[n] === undefined ? null : row[n];
    await this.csv.write(csvLine(this.names.map((n) => ordered[n])));
    await this.ndjson.write(JSON.stringify(ordered) + '\n');
    this.rows++;
  }
  async close(): Promise<FileEntry[]> {
    if (!this.ready) { await this.csv.write(csvLine(this.names)); this.ready = true; }
    await Promise.all([this.csv.close(), this.ndjson.close()]);
    return OPEN_DATA_FORMATS.map((fmt) => {
      const path = fileName(this.table, this.scope, this.congress, fmt.format);
      const abs = join(this.outDir, path);
      return {
        path,
        table: this.table,
        scope: this.scope,
        congress: this.scope === 'congress' ? this.congress : null,
        format: fmt.format,
        mediatype: fmt.mediatype,
        encoding: 'gzip' as const,
        rows: this.rows,
        bytes: statSync(abs).size,
        sha256: sha256File(abs),
        url: `${OPEN_DATA_BASE_URL}/${path}`,
      };
    });
  }
}

export function sha256File(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

/** Writes a table to its full-archive file and, when `congressOf` says the row
 * belongs to the current Congress, to the current-Congress file too. */
class ScopedWriters {
  all: TableWriter;
  current: TableWriter | null;
  constructor(outDir: string, table: string, congress: number) {
    const spec = OPEN_DATA_TABLES.find((t) => t.table === table)!;
    this.all = new TableWriter(outDir, table, 'all', congress);
    this.current = spec.scopes.includes('congress') ? new TableWriter(outDir, table, 'congress', congress) : null;
  }
  async write(row: Row, inCurrent: boolean) {
    await this.all.write(row);
    if (inCurrent && this.current) await this.current.write(row);
  }
  async close(): Promise<FileEntry[]> {
    const out = await this.all.close();
    if (this.current) out.push(...(await this.current.close()));
    return out;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportOptions {
  client: Client;
  outDir: string;
  congress?: number;
  now?: Date;
  pageSize?: number;
  log?: (msg: string) => void;
}

export interface Manifest {
  name: string;
  title: string;
  generated_at: string;
  snapshot_date: string;
  data_updated_at: string | null;
  current_congress: number;
  license: typeof DATA_LICENSE;
  attribution: string;
  citation: string;
  update_cadence: string;
  sources: typeof DATA_SOURCES;
  base_url: string;
  archive_url: string;
  datapackage: string;
  row_counts: Record<string, number>;
  notes: string[];
  files: FileEntry[];
}

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|could not find the table/i.test(e?.message || '');
}

export async function exportOpenData(opts: ExportOptions): Promise<Manifest> {
  const { client } = opts;
  const now = opts.now ?? new Date();
  const congress = opts.congress ?? currentCongress(now);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const log = opts.log ?? (() => {});
  const outDir = resolve(opts.outDir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const files: FileEntry[] = [];
  const notes: string[] = [];

  // 1. member_terms (and the open current-Congress term for each member).
  const currentTerm = new Map<string, Row>();
  {
    const w = new ScopedWriters(outDir, 'member_terms', congress);
    for await (const page of paginate(client, 'member_congress_terms',
      'bioguide_id, congress, term_start, term_end, chamber, state, district, party, caucus, reason_for_end, source',
      { orderBy: ['bioguide_id', 'congress', 'term_start'], pageSize })) {
      for (const t of page) {
        await w.write({ ...t, term_start: dateOnly(t.term_start), term_end: dateOnly(t.term_end), district: emptyToNull(t.district), caucus: emptyToNull(t.caucus) }, false);
        if (Number(t.congress) === congress && !t.term_end) {
          const prev = currentTerm.get(String(t.bioguide_id));
          if (!prev || String(t.term_start) > String(prev.term_start)) currentTerm.set(String(t.bioguide_id), t);
        }
      }
    }
    files.push(...(await w.close()));
    log(`member_terms: ${w.all.rows}`);
  }

  // 2. members.
  {
    const w = new ScopedWriters(outDir, 'members', congress);
    for await (const page of paginate(client, 'politicians', 'id, name, chamber, state, district, party, photo_url', { orderBy: ['id'], pageSize })) {
      for (const p of page) {
        const id = String(p.id);
        const term = currentTerm.get(id);
        await w.write({
          bioguide_id: id,
          name: p.name,
          chamber: term?.chamber ?? p.chamber,
          state: term?.state ?? p.state,
          district: emptyToNull(term ? term.district : p.district),
          party: term?.party ?? p.party,
          caucus: emptyToNull(term?.caucus),
          serving_current_congress: Boolean(term),
          current_term_start: term ? dateOnly(term.term_start) : null,
          photo_url: emptyToNull(p.photo_url),
          profile_url: `${SITE_ORIGIN}/politician/${id}`,
          source_url: `https://www.congress.gov/member/${id}`,
        }, false);
      }
    }
    files.push(...(await w.close()));
    log(`members: ${w.all.rows}`);
  }

  // 3. bills (placeholder titles are blanked, never published).
  {
    const w = new ScopedWriters(outDir, 'bills', congress);
    let placeholders = 0;
    for await (const page of paginate(client, 'bills',
      'id, title, introduced_at, policy_area, legislative_stage, sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state, source_url',
      { orderBy: ['id'], pageSize })) {
      for (const b of page) {
        const row = billRow(b);
        if (!row) continue;
        if (row.title === null) placeholders++;
        await w.write(row, row.congress === congress);
      }
    }
    files.push(...(await w.close()));
    if (placeholders) notes.push(`${placeholders} bills have no official title yet; their title is empty (placeholder titles are never published).`);
    log(`bills: ${w.all.rows} (${placeholders} without an official title)`);
  }

  // 4. bill_cosponsors (optional: skipped if the table is missing).
  {
    const w = new ScopedWriters(outDir, 'bill_cosponsors', congress);
    let missing = false;
    try {
      for await (const page of paginate(client, 'bill_cosponsors', 'bill_id, bioguide_id, cosponsored_at, withdrawn_at', { orderBy: ['bill_id', 'bioguide_id'], pageSize })) {
        for (const c of page) {
          const p = parseBillId(String(c.bill_id));
          await w.write({ ...c, cosponsored_at: dateOnly(c.cosponsored_at), withdrawn_at: dateOnly(c.withdrawn_at) }, p?.congress === congress);
        }
      }
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      missing = true;
    }
    const entries = await w.close();
    if (missing) {
      for (const e of entries) rmSync(join(outDir, e.path), { force: true });
      notes.push('bill_cosponsors is not available in this snapshot.');
      log('bill_cosponsors: table missing, skipped');
    } else {
      files.push(...entries);
      log(`bill_cosponsors: ${w.all.rows}`);
    }
  }

  // 5. votes (keyset on id). Remembers each roll call's official source URL
  //    and date so roll calls missing from roll_calls still get a row.
  const seen = new Map<string, { voted_at: string | null; source_url: string | null }>();
  {
    const w = new ScopedWriters(outDir, 'votes', congress);
    let skipped = 0;
    for await (const page of paginate(client, 'votes', 'id, politician_id, roll_call_id, position, voted_at, source_url', { orderBy: ['id'], keyset: 'id', pageSize })) {
      for (const v of page) {
        const rcId = String(v.roll_call_id ?? '').toLowerCase();
        const p = parseRollCallId(rcId);
        if (!p) { skipped++; continue; }
        if (!seen.has(rcId)) seen.set(rcId, { voted_at: dateOnly(v.voted_at), source_url: (v.source_url as string) || null });
        await w.write({ roll_call_id: rcId, bioguide_id: v.politician_id, position: v.position, voted_at: dateOnly(v.voted_at) }, p.congress === congress);
      }
    }
    files.push(...(await w.close()));
    if (skipped) notes.push(`${skipped} vote rows without a roll-call id were left out.`);
    log(`votes: ${w.all.rows} (${skipped} without a roll-call id skipped)`);
  }

  // 6. roll_calls: every id in roll_calls or referenced by a vote.
  {
    const rcs = new Map<string, Row>();
    for await (const page of paginate(client, 'roll_calls', 'id, bill_id, question, description, voted_at', { orderBy: ['id'], pageSize })) {
      for (const r of page) rcs.set(String(r.id).toLowerCase(), r);
    }
    const stats = new Map<string, StatsRow>();
    for await (const page of paginate(client, 'roll_call_stats', 'roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay', { orderBy: ['roll_call_id'], pageSize })) {
      for (const s of page) stats.set(String(s.roll_call_id).toLowerCase(), s as StatsRow);
    }
    const ids = [...new Set([...rcs.keys(), ...seen.keys()])].filter((id) => parseRollCallId(id)).sort(compareRollCallIds);
    const w = new ScopedWriters(outDir, 'roll_calls', congress);
    let insane = 0;
    for (const id of ids) {
      const row = rollCallRow(id, rcs.get(id), stats.get(id), seen.get(id));
      if (!row) continue;
      if (row.yea === null) insane++;
      await w.write(row, row.congress === congress);
    }
    files.push(...(await w.close()));
    if (insane) notes.push(`${insane} roll calls have no trustworthy tally; their tally and result are empty.`);
    log(`roll_calls: ${w.all.rows} (${insane} without a sane tally)`);
  }

  let dataUpdatedAt: string | null = null;
  try {
    const { data } = await client.from('etl_metadata').select('value').eq('key', 'last_successful_run').maybeSingle();
    dataUpdatedAt = data?.value ?? null;
  } catch { /* optional */ }

  const rowCounts: Record<string, number> = {};
  for (const fe of files) if (fe.format === 'csv') rowCounts[fe.path.replace(/\.csv\.gz$/, '')] = fe.rows;

  const manifest: Manifest = {
    name: 'ballotwatch-congressional-record',
    title: 'BallotWatch U.S. congressional record: open data snapshot',
    generated_at: now.toISOString(),
    snapshot_date: now.toISOString().slice(0, 10),
    data_updated_at: dataUpdatedAt,
    current_congress: congress,
    license: DATA_LICENSE,
    attribution: ATTRIBUTION,
    citation: CITATION.replace('{date}', now.toISOString().slice(0, 10)),
    update_cadence: UPDATE_CADENCE,
    sources: DATA_SOURCES,
    base_url: `${OPEN_DATA_BASE_URL}/`,
    archive_url: `${SITE_ORIGIN}${OPEN_DATA_ARCHIVE_PATH}/${now.toISOString().slice(0, 10)}/`,
    datapackage: DATAPACKAGE_URL,
    row_counts: rowCounts,
    notes,
    files,
  };

  const datapackage = buildDatapackage(manifest);
  writeFileSync(join(outDir, 'datapackage.json'), JSON.stringify(datapackage, null, 2) + '\n');
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

/**
 * Frictionless tabular-data-package over the CSV files (NDJSON copies are
 * listed in manifest.json). Foreign keys point at the resource in the same
 * scope for roll calls, and at the full-archive resource for members and bills.
 */
export function buildDatapackage(manifest: Manifest) {
  const congress = manifest.current_congress;
  const present = new Set(manifest.files.map((x) => x.path));
  const resources = manifest.files.filter((x) => x.format === 'csv').map((fe) => {
    const spec = OPEN_DATA_TABLES.find((t) => t.table === fe.table)!;
    const foreignKeys = spec.foreignKeys
      .map((fk) => {
        const refScope: Scope = fk.reference.resource === 'roll_calls' ? fe.scope : 'all';
        if (!present.has(fileName(fk.reference.resource, refScope, congress, 'csv'))) return null;
        return { fields: fk.fields, reference: { resource: resourceName(fk.reference.resource, refScope, congress), fields: fk.reference.fields } };
      })
      .filter(Boolean);
    return {
      name: resourceName(fe.table, fe.scope, congress),
      title: fe.scope === 'congress' ? `${spec.title}, ${congress}th Congress` : `${spec.title}, full archive`,
      description: spec.description,
      path: fe.path,
      profile: 'tabular-data-resource',
      format: 'csv',
      mediatype: 'text/csv',
      compression: 'gz',
      encoding: 'utf-8',
      bytes: fe.bytes,
      hash: `sha256:${fe.sha256}`,
      dialect: { delimiter: ',', quoteChar: '"', doubleQuote: true, header: true, lineTerminator: '\n' },
      schema: {
        fields: spec.fields.map((fld) => ({ ...fld, ...(fld.type === 'date' ? { format: 'default' } : {}) })),
        missingValues: [''],
        primaryKey: spec.primaryKey,
        ...(foreignKeys.length ? { foreignKeys } : {}),
      },
    };
  });
  return {
    profile: 'tabular-data-package',
    name: manifest.name,
    title: manifest.title,
    description: 'Every member, member term, bill, cosponsorship, roll-call vote, and member vote position in the BallotWatch database, as gzip CSV. Full archive plus the current Congress. Derived fields: a roll call\'s result is computed from the tally and the question; tallies that fail a sanity check are left empty. Placeholder bill titles are never published.',
    homepage: `${SITE_ORIGIN}/open`,
    version: manifest.snapshot_date,
    created: manifest.generated_at,
    keywords: ['congress', 'roll call votes', 'legislation', 'united states', 'open data'],
    licenses: [{ name: DATA_LICENSE.name, title: DATA_LICENSE.title, path: DATA_LICENSE.path }],
    sources: DATA_SOURCES.map(({ title, path }) => ({ title, path })),
    contributors: [{ title: 'BallotWatch', path: SITE_ORIGIN, role: 'publisher' }],
    resources,
  };
}

// ---------------------------------------------------------------------------
// Upload (Supabase Storage)
// ---------------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = { 'csv.gz': 'application/gzip', 'ndjson.gz': 'application/gzip', json: 'application/json' };

/** Content type for a snapshot file. Gzip files are application/gzip with no
 * Content-Encoding, so browsers and curl download the .gz bytes as-is. */
export function contentTypeFor(path: string): string {
  if (path.endsWith('.gz')) return CONTENT_TYPES['csv.gz'];
  if (path.endsWith('.json')) return CONTENT_TYPES.json;
  return 'application/octet-stream';
}

export async function ensurePublicBucket(client: Client, bucket = OPEN_DATA_BUCKET, log: (m: string) => void = () => {}) {
  const { data, error } = await client.storage.getBucket(bucket);
  if (!error && data) {
    if (!data.public) {
      const upd = await client.storage.updateBucket(bucket, { public: true });
      if (upd.error) throw new Error(`updateBucket: ${upd.error.message}`);
      log(`bucket ${bucket}: made public`);
    }
    return;
  }
  const created = await client.storage.createBucket(bucket, { public: true });
  if (created.error && !/already exists/i.test(created.error.message || '')) throw new Error(`createBucket: ${created.error.message}`);
  log(`bucket ${bucket}: created (public)`);
}

const DATED_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function uploadSnapshot(client: Client, outDir: string, manifest: Manifest, log: (m: string) => void = () => {}, bucket = OPEN_DATA_BUCKET) {
  await ensurePublicBucket(client, bucket, log);
  const store = client.storage.from(bucket);
  const dated = manifest.snapshot_date;
  // Data files first, manifest last, so latest/manifest.json never lists a
  // file that is not there yet.
  const names = [...manifest.files.map((x) => x.path), 'datapackage.json', 'manifest.json'];
  for (const [prefix, cacheControl] of [[dated, '31536000'], [LATEST_PREFIX, '900']] as const) {
    for (const name of names) {
      const body = readFileSync(join(outDir, name));
      const { error } = await store.upload(`${prefix}/${name}`, body, { contentType: contentTypeFor(name), cacheControl, upsert: true });
      if (error) throw new Error(`upload ${prefix}/${name}: ${error.message}`);
    }
    log(`uploaded ${names.length} files to ${bucket}/${prefix}/`);
  }
  await pruneSnapshots(client, bucket, KEEP_DATED_SNAPSHOTS, log);
}

/** Deletes dated prefixes beyond the newest `keep`. Never touches latest/. */
export async function pruneSnapshots(client: Client, bucket = OPEN_DATA_BUCKET, keep = KEEP_DATED_SNAPSHOTS, log: (m: string) => void = () => {}) {
  const store = client.storage.from(bucket);
  const { data, error } = await store.list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
  if (error) throw new Error(`list: ${error.message}`);
  const dated = (data || []).map((e: Row) => String(e.name)).filter((n: string) => DATED_RE.test(n)).sort().reverse();
  const stale = dated.slice(keep);
  for (const prefix of stale) {
    const { data: inner, error: e2 } = await store.list(prefix, { limit: 1000 });
    if (e2) throw new Error(`list ${prefix}: ${e2.message}`);
    const paths = (inner || []).map((x: Row) => `${prefix}/${x.name}`);
    if (paths.length) {
      const { error: e3 } = await store.remove(paths);
      if (e3) throw new Error(`remove ${prefix}: ${e3.message}`);
    }
    log(`pruned ${bucket}/${prefix}/ (${paths.length} files)`);
  }
  return stale;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  const outDir = argValue(args, '--out') || 'dist-data';
  const congressArg = argValue(args, '--congress');
  const log = (m: string) => console.log(`[open-data] ${m}`);
  const started = Date.now();
  const manifest = await exportOpenData({ client, outDir, congress: congressArg ? Number(congressArg) : undefined, log });
  log(`wrote ${manifest.files.length} files + manifest.json + datapackage.json to ${outDir}/ in ${Math.round((Date.now() - started) / 1000)}s`);
  if (args.includes('--upload')) {
    await uploadSnapshot(client, resolve(outDir), manifest, log);
    log(`live at ${MANIFEST_URL} once the CDN cache turns over`);
  }
}

if (process.argv[1] && /exportOpenData\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error('[open-data] failed:', err?.message || err);
    process.exit(1);
  });
}
