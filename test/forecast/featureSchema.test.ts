import { describe, expect, it } from 'vitest';
import {
  assertSnapshotSchemaVersionOnHashDrift,
  buildCanonicalFeatureSnapshot,
} from '../../etl/forecast/featureSchema.js';

const source = (revisionId: string, availableAt = '2025-01-02T12:00:00.000Z') => ({
  source: 'official_fixture',
  sourceUrl: `https://example.test/${revisionId}`,
  availableAt,
  revisionId,
});

function fixture() {
  return {
    rollCallId: 'house-118-2-1',
    featureCutoffAt: '2025-01-02T13:00:00.000Z',
    cutoffQuality: 'official_schedule' as const,
    eventFeatures: { chamber: 'house', policyArea: 'Health' },
    eventSources: [source('bill'), source('schedule')],
    memberRows: [
      { politicianId: 'B000002', features: { tenure: 4 }, sources: [source('B')] },
      { politicianId: 'A000001', features: { tenure: 2 }, sources: [source('A')] },
    ],
  };
}

describe('buildCanonicalFeatureSnapshot', () => {
  it('splits event/member features and sorts the roster deterministically', () => {
    const snapshot = buildCanonicalFeatureSnapshot(fixture());
    expect(snapshot.rows.map((row) => row.politicianId)).toEqual(['A000001', 'B000002']);
    expect(snapshot.rows[0].canonicalMemberFeatures).not.toContain('policyArea');
    expect(snapshot.canonicalEventFeatures).toContain('policyArea');
  });

  it('is stable when source and member input order changes', () => {
    const first = fixture();
    const second = fixture();
    second.eventSources.reverse();
    second.memberRows.reverse();
    expect(buildCanonicalFeatureSnapshot(first).rosterSha256).toBe(
      buildCanonicalFeatureSnapshot(second).rosterSha256,
    );
  });

  it('rejects leakage from a post-cutoff source', () => {
    const input = fixture();
    input.memberRows[0].sources = [source('late', '2025-01-02T14:00:00.000Z')];
    expect(() => buildCanonicalFeatureSnapshot(input)).toThrow(/newer than feature cutoff/);
  });

  it('rejects missing provenance, duplicate members, and ambiguous snapshot identity', () => {
    const incomplete = fixture();
    incomplete.eventSources[0].revisionId = '';
    expect(() => buildCanonicalFeatureSnapshot(incomplete)).toThrow(/provenance is incomplete/);

    const duplicate = fixture();
    duplicate.memberRows[1].politicianId = duplicate.memberRows[0].politicianId;
    expect(() => buildCanonicalFeatureSnapshot(duplicate)).toThrow(/duplicate member/);

    const ambiguous = { ...fixture(), sourceEventId: 'event-1' };
    expect(() => buildCanonicalFeatureSnapshot(ambiguous)).toThrow(/exactly one/);
  });

  it('rejects a missing source timestamp', () => {
    const input = fixture();
    input.eventSources[0].availableAt = '';
    expect(() => buildCanonicalFeatureSnapshot(input)).toThrow(/source timestamp is missing/);
  });

  it('rejects invalid timestamps, empty rosters, and missing member identities', () => {
    const invalidCutoff = fixture();
    invalidCutoff.featureCutoffAt = 'not-a-timestamp';
    expect(() => buildCanonicalFeatureSnapshot(invalidCutoff)).toThrow(/featureCutoffAt/);

    const invalidSource = fixture();
    invalidSource.eventSources[0].availableAt = 'not-a-timestamp';
    expect(() => buildCanonicalFeatureSnapshot(invalidSource)).toThrow(/availableAt/);

    const emptyRoster = fixture();
    emptyRoster.memberRows = [];
    expect(() => buildCanonicalFeatureSnapshot(emptyRoster)).toThrow(/must not be empty/);

    const missingMember = fixture();
    missingMember.memberRows[0].politicianId = '';
    expect(() => buildCanonicalFeatureSnapshot(missingMember)).toThrow(/politicianId is required/);
  });

  it('supports event-based snapshots and rejects a missing snapshot identity', () => {
    const eventInput = fixture();
    delete eventInput.rollCallId;
    const eventSnapshot = buildCanonicalFeatureSnapshot({
      ...eventInput,
      sourceEventId: 'event-1',
    });
    expect(eventSnapshot).toMatchObject({ sourceEventId: 'event-1', rollCallId: null });

    expect(() => buildCanonicalFeatureSnapshot(eventInput)).toThrow(/exactly one/);
  });

  it('rejects outcome leakage, unknown feature keys, and unsourced populated features', () => {
    const outcomeLeak = fixture();
    outcomeLeak.eventFeatures = { actualOutcome: 'passed' };
    expect(() => buildCanonicalFeatureSnapshot(outcomeLeak)).toThrow(/not allowed/);

    const unknownMemberFeature = fixture();
    unknownMemberFeature.memberRows[0].features = { finalRollCallYea: 300 };
    expect(() => buildCanonicalFeatureSnapshot(unknownMemberFeature)).toThrow(/not allowed/);

    const unsourced = fixture();
    unsourced.eventSources = [];
    expect(() => buildCanonicalFeatureSnapshot(unsourced)).toThrow(/require source provenance/);
  });

  it('requires a schema bump when the same logical snapshot changes hash', () => {
    const existing = buildCanonicalFeatureSnapshot(fixture());
    const changedInput = fixture();
    changedInput.eventFeatures.policyArea = 'Agriculture';
    const candidate = buildCanonicalFeatureSnapshot(changedInput);

    expect(() => assertSnapshotSchemaVersionOnHashDrift(existing, candidate)).toThrow(
      /without a feature schema version bump/,
    );

    expect(() => assertSnapshotSchemaVersionOnHashDrift(existing, {
      ...candidate,
      featureSchemaVersion: 'forecast-features-v2',
    })).not.toThrow();
  });

  it('does not compare hashes across different logical snapshot identities', () => {
    const existing = buildCanonicalFeatureSnapshot(fixture());
    const nextInput = fixture();
    nextInput.rollCallId = 'house-118-2-2';
    nextInput.eventFeatures.policyArea = 'Agriculture';
    expect(() => assertSnapshotSchemaVersionOnHashDrift(
      existing,
      buildCanonicalFeatureSnapshot(nextInput),
    )).not.toThrow();
  });
});
