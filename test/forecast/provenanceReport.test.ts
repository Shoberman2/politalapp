import { describe, expect, it } from 'vitest';
import {
  buildProvenanceAuditReport,
  PROVENANCE_AUDIT_SCHEMA_VERSION,
  type ProvenanceAuditDocument,
} from '../../etl/forecast/provenanceReport.js';

function document(): ProvenanceAuditDocument {
  return {
    schemaVersion: PROVENANCE_AUDIT_SCHEMA_VERSION,
    congress: 118,
    generatedAt: '2026-09-01T22:00:00Z',
    sources: [{
      source: 'fixture',
      status: 'ready',
      evidenceUrl: 'https://example.test/source',
      reason: 'fixture',
    }],
    rows: Array.from({ length: 100 }, (_, index) => ({
      id: `row-${index}`,
      congress: 118,
      supportedTarget: true,
      quality: index < 95 ? 'exact_official' as const : 'synthetic_conservative' as const,
      exactMemberInterval: true,
      officialCutoffAt: index < 95 ? '2024-01-01T12:00:00Z' : null,
      allFeatureSourcesAtOrBeforeCutoff: true,
      finalTestCandidate: index < 10,
    })),
  };
}

describe('buildProvenanceAuditReport', () => {
  it('emits GO only when source blockers and row coverage both pass', () => {
    expect(buildProvenanceAuditReport(document()).decision).toBe('GO');
  });

  it('keeps a passing coverage report at NO_GO when a source is blocked', () => {
    const input = document();
    input.sources[0].status = 'blocked';
    expect(buildProvenanceAuditReport(input)).toMatchObject({
      decision: 'NO_GO',
      sourceBlockers: [{ source: 'fixture' }],
    });
  });

  it('rejects schema drift, cross-Congress rows, and duplicate identities', () => {
    expect(() => buildProvenanceAuditReport({
      ...document(),
      schemaVersion: 'future-version',
    })).toThrow(/unsupported provenance audit schema/);

    const crossCongress = document();
    crossCongress.rows[0].congress = 117;
    expect(() => buildProvenanceAuditReport(crossCongress)).toThrow(/belongs to Congress/);

    const duplicate = document();
    duplicate.rows[1].id = duplicate.rows[0].id;
    expect(() => buildProvenanceAuditReport(duplicate)).toThrow(/duplicate or missing row id/);
  });

  it('rejects invalid metadata, collection shapes, and missing row identities', () => {
    expect(() => buildProvenanceAuditReport({ ...document(), congress: 0 })).toThrow(
      /positive integer/,
    );
    expect(() => buildProvenanceAuditReport({
      ...document(),
      generatedAt: 'not-a-timestamp',
    })).toThrow(/generatedAt/);
    expect(() => buildProvenanceAuditReport({
      ...document(),
      sources: null as unknown as ProvenanceAuditDocument['sources'],
    })).toThrow(/must be arrays/);

    const missingId = document();
    missingId.rows[0].id = '';
    expect(() => buildProvenanceAuditReport(missingId)).toThrow(/invalid provenance row/);
  });

  it('rejects truthy strings and unknown statuses instead of opening the gate', () => {
    const invalid = document() as unknown as {
      sources: Array<Record<string, unknown>>;
      rows: Array<Record<string, unknown>>;
    } & ProvenanceAuditDocument;
    invalid.sources[0].status = 'BLOCKED';
    invalid.rows[0].exactMemberInterval = 'false';
    invalid.rows[0].allFeatureSourcesAtOrBeforeCutoff = 'false';
    expect(() => buildProvenanceAuditReport(invalid)).toThrow(/invalid provenance source/);

    const invalidRow = document() as unknown as {
      rows: Array<Record<string, unknown>>;
    } & ProvenanceAuditDocument;
    invalidRow.rows[0].exactMemberInterval = 'false';
    expect(() => buildProvenanceAuditReport(invalidRow)).toThrow(/invalid provenance row/);
  });
});
