export type ProvenanceQuality = 'exact_official' | 'synthetic_conservative' | 'unusable';

export interface ProvenanceExample {
  id: string;
  congress: number;
  supportedTarget: boolean;
  quality: ProvenanceQuality;
  exactMemberInterval: boolean;
  officialCutoffAt: string | null;
  allFeatureSourcesAtOrBeforeCutoff: boolean;
  finalTestCandidate: boolean;
}

export interface ProvenanceGateResult {
  eligibleCorpusRows: number;
  exactCorpusRows: number;
  exactCorpusCoverage: number;
  finalTestRows: number;
  exactFinalTestRows: number;
  exactFinalTestCoverage: number;
  passes: boolean;
  reasons: string[];
}

export function evaluateProvenanceGate(
  examples: ProvenanceExample[],
  minimumCorpusCoverage = 0.95,
): ProvenanceGateResult {
  if (minimumCorpusCoverage < 0 || minimumCorpusCoverage > 1) {
    throw new RangeError('minimumCorpusCoverage must be between 0 and 1');
  }
  // Coverage is over every supported roll call. Excluding unusable rows from
  // the denominator would let missing evidence make the metric look better.
  const corpus = examples.filter((row) => row.supportedTarget);
  const isExact = (row: ProvenanceExample) =>
    row.quality === 'exact_official'
    && row.exactMemberInterval
    && row.officialCutoffAt !== null
    && Number.isFinite(Date.parse(row.officialCutoffAt))
    && row.allFeatureSourcesAtOrBeforeCutoff;
  const exactCorpus = corpus.filter(isExact);
  const finalTest = corpus.filter((row) => row.finalTestCandidate);
  const exactFinalTest = finalTest.filter(isExact);
  const exactCorpusCoverage = corpus.length === 0 ? 0 : exactCorpus.length / corpus.length;
  const exactFinalTestCoverage = finalTest.length === 0 ? 0 : exactFinalTest.length / finalTest.length;
  const reasons: string[] = [];
  if (corpus.length === 0) reasons.push('no_eligible_supported_rows');
  if (corpus.some((row) => !row.exactMemberInterval)) {
    reasons.push('exact_member_interval_required');
  }
  if (
    corpus.some(
      (row) => row.quality === 'exact_official'
        && (row.officialCutoffAt === null || !Number.isFinite(Date.parse(row.officialCutoffAt))),
    )
  ) {
    reasons.push('exact_official_rows_require_valid_cutoff_timestamp');
  }
  if (corpus.some((row) => !row.allFeatureSourcesAtOrBeforeCutoff)) {
    reasons.push('feature_source_revision_exceeds_cutoff');
  }
  if (exactCorpusCoverage < minimumCorpusCoverage) reasons.push('corpus_exact_cutoff_coverage_below_gate');
  if (finalTest.length === 0) reasons.push('no_final_test_candidates');
  if (exactFinalTestCoverage !== 1) reasons.push('final_test_requires_exact_cutoff_for_every_row');
  return {
    eligibleCorpusRows: corpus.length,
    exactCorpusRows: exactCorpus.length,
    exactCorpusCoverage,
    finalTestRows: finalTest.length,
    exactFinalTestRows: exactFinalTest.length,
    exactFinalTestCoverage,
    passes: reasons.length === 0,
    reasons,
  };
}
