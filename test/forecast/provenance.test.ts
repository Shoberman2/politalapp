import { describe, expect, it } from 'vitest';
import { evaluateProvenanceGate, type ProvenanceExample } from '../../etl/forecast/provenance.js';

function examples(exactCorpus: number, syntheticCorpus: number): ProvenanceExample[] {
  return [
    ...Array.from({ length: exactCorpus }, (_, index) => ({
      id: `exact-${index}`,
      congress: 118,
      supportedTarget: true,
      quality: 'exact_official' as const,
      exactMemberInterval: true,
      officialCutoffAt: '2024-01-01T12:00:00Z',
      allFeatureSourcesAtOrBeforeCutoff: true,
      finalTestCandidate: index < 10,
    })),
    ...Array.from({ length: syntheticCorpus }, (_, index) => ({
      id: `synthetic-${index}`,
      congress: 118,
      supportedTarget: true,
      quality: 'synthetic_conservative' as const,
      exactMemberInterval: true,
      officialCutoffAt: null,
      allFeatureSourcesAtOrBeforeCutoff: true,
      finalTestCandidate: false,
    })),
  ];
}

describe('evaluateProvenanceGate', () => {
  it('passes at 95% corpus coverage with every final-test row exact', () => {
    const result = evaluateProvenanceGate(examples(95, 5));
    expect(result.passes).toBe(true);
    expect(result.exactCorpusCoverage).toBe(0.95);
    expect(result.exactFinalTestCoverage).toBe(1);
  });

  it('fails below corpus coverage', () => {
    expect(evaluateProvenanceGate(examples(94, 6))).toMatchObject({
      passes: false,
      reasons: ['corpus_exact_cutoff_coverage_below_gate'],
    });
  });

  it('fails if any final-test candidate is synthetic', () => {
    const rows = examples(95, 5);
    rows[95].finalTestCandidate = true;
    const result = evaluateProvenanceGate(rows);
    expect(result.passes).toBe(false);
    expect(result.reasons).toContain('final_test_requires_exact_cutoff_for_every_row');
  });

  it('does not trust an exact label without exact temporal evidence', () => {
    const rows = examples(100, 0);
    rows[20].exactMemberInterval = false;
    rows[21].officialCutoffAt = 'not-a-timestamp';
    rows[22].allFeatureSourcesAtOrBeforeCutoff = false;

    const result = evaluateProvenanceGate(rows);
    expect(result.exactCorpusRows).toBe(97);
    expect(result.passes).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'exact_member_interval_required',
      'exact_official_rows_require_valid_cutoff_timestamp',
      'feature_source_revision_exceeds_cutoff',
    ]));
  });

  it('counts unusable supported rows in the coverage denominator', () => {
    const rows = examples(95, 0);
    rows.push({
      id: 'unusable',
      congress: 118,
      supportedTarget: true,
      quality: 'unusable',
      exactMemberInterval: false,
      officialCutoffAt: null,
      allFeatureSourcesAtOrBeforeCutoff: false,
      finalTestCandidate: false,
    });
    expect(evaluateProvenanceGate(rows).exactCorpusCoverage).toBeCloseTo(95 / 96);
  });

  it('fails closed for an empty corpus and rejects invalid thresholds', () => {
    expect(evaluateProvenanceGate([])).toMatchObject({
      passes: false,
      reasons: expect.arrayContaining([
        'no_eligible_supported_rows',
        'no_final_test_candidates',
      ]),
    });
    expect(() => evaluateProvenanceGate([], -0.01)).toThrow(/between 0 and 1/);
    expect(() => evaluateProvenanceGate([], 1.01)).toThrow(/between 0 and 1/);
  });
});
