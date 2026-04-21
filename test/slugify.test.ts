import { describe, it, expect } from 'vitest';
import {
  slugify,
  generateVoteSlug,
  buildVoteUrl,
  parseVoteUrl,
} from '../lib/slugify.js';

describe('slugify', () => {
  it('is deterministic for the same input', () => {
    expect(slugify('SNAP Reauthorization Act')).toBe(
      slugify('SNAP Reauthorization Act'),
    );
  });

  it('lowercases and dash-separates words', () => {
    expect(slugify('SNAP Reauthorization Act')).toBe('snap-reauthorization-act');
  });

  it('handles ampersand as "and"', () => {
    expect(slugify('Faber & Faber Act')).toBe('faber-and-faber-act');
  });

  it('strips diacritics from unicode', () => {
    expect(slugify('Reautorización de SNAP')).toBe('reautorizacion-de-snap');
  });

  it('handles emoji and non-BMP unicode gracefully', () => {
    expect(slugify('🚀 Launch Act')).toBe('launch-act');
  });

  it('collapses consecutive non-alphanumeric characters', () => {
    expect(slugify('HR 1 -- the "For the People" Act')).toBe(
      'hr-1-the-for-the-people-act',
    );
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  --hello world--  ')).toBe('hello-world');
  });

  it('truncates at 60 characters on word boundary', () => {
    const long =
      'The Comprehensive National Act to Reform Everything About How Things Work in the Federal System Across All Agencies';
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(60);
    // Should not end with a partial word
    expect(s).not.toMatch(/-[a-z]{1,2}$/);
  });

  it('truncates at exactly 60 if no word boundary found in back 70%', () => {
    const s = slugify('a'.repeat(100));
    expect(s.length).toBe(60);
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns empty string for input with only symbols', () => {
    expect(slugify('!!!@@@###')).toBe('');
  });

  it('handles SQL injection characters safely', () => {
    expect(slugify("'; DROP TABLE votes; --")).toBe('drop-table-votes');
  });

  it('handles HTML entities as text', () => {
    expect(slugify('Bill with <script> tags')).toBe('bill-with-script-tags');
  });

  it('is idempotent', () => {
    const s1 = slugify('SNAP Reauthorization Act');
    const s2 = slugify(s1);
    expect(s2).toBe(s1);
  });
});

describe('generateVoteSlug — source chain', () => {
  const base = { roll_call_id: 'senate-118-1-423' };

  it('uses specific question text when available', () => {
    expect(
      generateVoteSlug({
        ...base,
        question: 'On the Motion to Invoke Cloture on SNAP Reauthorization',
        bill_title: 'SNAP Act',
      }),
    ).toBe('on-the-motion-to-invoke-cloture-on-snap-reauthorization');
  });

  it('falls through to bill title on generic question', () => {
    expect(
      generateVoteSlug({
        ...base,
        question: 'On Passage',
        bill_title: 'SNAP Reauthorization Act of 2026',
      }),
    ).toBe('snap-reauthorization-act-of-2026');
  });

  it('falls through to bill title on "On the Motion"', () => {
    expect(
      generateVoteSlug({
        ...base,
        question: 'On the Motion',
        bill_title: 'Build Back Better Act',
      }),
    ).toBe('build-back-better-act');
  });

  it('uses procedural-motion prefix when no bill', () => {
    expect(
      generateVoteSlug({
        ...base,
        bill_title: null,
        motion_type: 'Motion to Recommit',
      }),
    ).toBe('procedural-motion-motion-to-recommit');
  });

  it('falls back to vote-{roll_call_id} when nothing else', () => {
    expect(generateVoteSlug(base)).toBe('vote-senate-118-1-423');
  });

  it('falls back when question is short', () => {
    expect(
      generateVoteSlug({
        ...base,
        question: 'Yes',
        bill_title: 'SNAP Act',
      }),
    ).toBe('snap-act');
  });

  it('falls back when all non-fallback sources produce empty slugs', () => {
    expect(
      generateVoteSlug({
        ...base,
        question: '!!!',
        bill_title: '...',
      }),
    ).toBe('vote-senate-118-1-423');
  });

  it('never returns an empty string', () => {
    expect(generateVoteSlug({ roll_call_id: 'x-y-z' })).not.toBe('');
  });
});

describe('buildVoteUrl + parseVoteUrl (roundtrip)', () => {
  it('builds the canonical vote URL shape', () => {
    const url = buildVoteUrl({
      congress: 118,
      chamber: 'senate',
      roll_number: 423,
      slug: 'snap-reauthorization-act-of-2026',
    });
    expect(url).toBe(
      '/vote/118/senate/423-snap-reauthorization-act-of-2026',
    );
  });

  it('lowercases chamber', () => {
    const url = buildVoteUrl({
      congress: 118,
      chamber: 'SENATE',
      roll_number: 1,
      slug: 'test',
    });
    expect(url).toBe('/vote/118/senate/1-test');
  });

  it('parses a well-formed URL', () => {
    const parsed = parseVoteUrl('/vote/118/senate/423-snap-reauthorization');
    expect(parsed).toEqual({
      congress: 118,
      chamber: 'senate',
      roll_number: 423,
      slug: 'snap-reauthorization',
    });
  });

  it('parses URLs with dashes in the slug', () => {
    const parsed = parseVoteUrl(
      '/vote/118/house/375-for-the-people-act-of-2025',
    );
    expect(parsed).toEqual({
      congress: 118,
      chamber: 'house',
      roll_number: 375,
      slug: 'for-the-people-act-of-2025',
    });
  });

  it('returns null for non-matching paths', () => {
    expect(parseVoteUrl('/not-a-vote')).toBeNull();
    expect(parseVoteUrl('/vote/118/invalid-chamber/1-x')).toBeNull();
    expect(parseVoteUrl('/vote/118/senate/NOTANUM-x')).toBeNull();
    expect(parseVoteUrl('/vote/118/senate/1')).toBeNull();
  });

  it('roundtrips build -> parse', () => {
    const input = {
      congress: 118,
      chamber: 'senate' as const,
      roll_number: 423,
      slug: 'snap-reauthorization-act-of-2026',
    };
    const url = buildVoteUrl(input);
    const parsed = parseVoteUrl(url);
    expect(parsed).toEqual(input);
  });
});
