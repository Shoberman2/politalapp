import { describe, it, expect } from 'vitest';
import { parseArgs, disambiguateSlug } from '../etl/backfillSlugs.js';

describe('backfillSlugs.parseArgs', () => {
  it('returns defaults when no args', () => {
    const args = parseArgs(['node', 'backfillSlugs.ts']);
    expect(args).toEqual({ dryRun: false, limit: null, batchSize: 500 });
  });

  it('parses --dry-run', () => {
    const args = parseArgs(['node', 'backfillSlugs.ts', '--dry-run']);
    expect(args.dryRun).toBe(true);
  });

  it('parses --limit', () => {
    const args = parseArgs(['node', 'backfillSlugs.ts', '--limit=1000']);
    expect(args.limit).toBe(1000);
  });

  it('parses --batch', () => {
    const args = parseArgs(['node', 'backfillSlugs.ts', '--batch=250']);
    expect(args.batchSize).toBe(250);
  });

  it('parses multiple flags', () => {
    const args = parseArgs([
      'node',
      'backfillSlugs.ts',
      '--dry-run',
      '--limit=500',
      '--batch=100',
    ]);
    expect(args).toEqual({ dryRun: true, limit: 500, batchSize: 100 });
  });
});

describe('backfillSlugs.disambiguateSlug', () => {
  it('appends roll_call_id to base slug', () => {
    expect(
      disambiguateSlug('snap-reauthorization', 'senate-118-1-423'),
    ).toBe('snap-reauthorization-senate-118-1-423');
  });

  it('produces deterministic output', () => {
    const a = disambiguateSlug('test', 'house-118-1-1');
    const b = disambiguateSlug('test', 'house-118-1-1');
    expect(a).toBe(b);
  });
});
