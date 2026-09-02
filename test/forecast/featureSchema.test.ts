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

  it('keeps the published PostgreSQL interoperability hash fixture stable', () => {
    const snapshot = buildCanonicalFeatureSnapshot({
      rollCallId: 'house-999-1-1',
      featureCutoffAt: '3787-02-01T00:00:00.000Z',
      cutoffQuality: 'official_schedule',
      eventFeatures: { chamber: 'house', policyArea: 'Health' },
      eventSources: [{
        source: 'roll_call',
        sourceUrl: 'https://example.test/vote/1',
        availableAt: '3787-01-31T00:00:00.000Z',
        revisionId: 'pgtap-event-v1',
      }],
      memberRows: [
        {
          politicianId: 'ZZTEST001',
          features: { tenure: 2 },
          sources: [{
            source: 'terms',
            sourceUrl: 'https://example.test/terms/1',
            availableAt: '3787-01-30T00:00:00.000Z',
            revisionId: 'pgtap-member-v1',
          }],
        },
        {
          politicianId: 'ZZTEST002',
          features: { tenure: 1 },
          sources: [{
            source: 'terms',
            sourceUrl: 'https://example.test/terms/2',
            availableAt: '3787-01-30T00:00:00.000Z',
            revisionId: 'pgtap-member-v1',
          }],
        },
      ],
    });

    expect(snapshot.eventSha256).toBe(
      'f9676e0466cc1af5dd54ea35cd75a953bad40497a3e977eef935832767e33f5e',
    );
    expect(snapshot.rows.map((row) => row.rowSha256)).toEqual([
      '3dc86cd4609b997a6d280180ff9a2b1c27876cb107c401a06d199e02cfb9832e',
      '6055fe7a2bfb712ea30452725cc4d61042fc28c2e92fc15158305c1b1c266297',
    ]);
    expect(snapshot.rosterSha256).toBe(
      'b3036cabcc3e2e01c1608ceb1d73825c6975b2ab515255c1aff547e2412fcf08',
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

  it('enforces exact runtime value types for every v1 feature', () => {
    const nestedPolicyArea = fixture();
    nestedPolicyArea.eventFeatures = {
      chamber: 'house',
      policyArea: { actualOutcome: 'passed' },
    };
    expect(() => buildCanonicalFeatureSnapshot(nestedPolicyArea)).toThrow(/policyArea/);

    const numericChamber = fixture();
    numericChamber.eventFeatures = { chamber: 123, policyArea: 'Health' };
    expect(() => buildCanonicalFeatureSnapshot(numericChamber)).toThrow(/chamber/);

    const outcomeInTenure = fixture();
    outcomeInTenure.memberRows[0].features = { tenure: 'actual tally 250-180' };
    expect(() => buildCanonicalFeatureSnapshot(outcomeInTenure)).toThrow(/tenure/);

    const fractionalTenure = fixture();
    fractionalTenure.memberRows[0].features = { tenure: 2.5 };
    expect(() => buildCanonicalFeatureSnapshot(fractionalTenure)).toThrow(/tenure/);

    const unsafeTenure = fixture();
    unsafeTenure.memberRows[0].features = { tenure: Number.MAX_SAFE_INTEGER + 1 };
    expect(() => buildCanonicalFeatureSnapshot(unsafeTenure)).toThrow(/tenure/);
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
