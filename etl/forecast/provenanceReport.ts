import { evaluateProvenanceGate, type ProvenanceExample } from './provenance.js';

export const PROVENANCE_AUDIT_SCHEMA_VERSION = 'forecast-provenance-audit-v1';

export interface ProvenanceSourceStatus {
  source: string;
  status: 'ready' | 'blocked';
  evidenceUrl: string;
  reason: string;
}

export interface ProvenanceAuditDocument {
  schemaVersion: string;
  congress: number;
  generatedAt: string;
  sources: ProvenanceSourceStatus[];
  rows: ProvenanceExample[];
}

export interface ProvenanceAuditReport {
  schemaVersion: string;
  congress: number;
  generatedAt: string;
  decision: 'GO' | 'NO_GO';
  sourceBlockers: ProvenanceSourceStatus[];
  gate: ReturnType<typeof evaluateProvenanceGate>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertAuditShape(document: ProvenanceAuditDocument): void {
  if (!Array.isArray(document.sources) || !Array.isArray(document.rows)) {
    throw new Error('provenance audit sources and rows must be arrays');
  }
  for (const [index, source] of document.sources.entries()) {
    if (
      !source || typeof source !== 'object'
      || !isNonEmptyString(source.source)
      || (source.status !== 'ready' && source.status !== 'blocked')
      || !isNonEmptyString(source.evidenceUrl)
      || !isNonEmptyString(source.reason)
    ) {
      throw new Error(`invalid provenance source at index ${index}`);
    }
  }
  for (const [index, row] of document.rows.entries()) {
    if (
      !row || typeof row !== 'object'
      || !isNonEmptyString(row.id)
      || !Number.isInteger(row.congress) || row.congress < 1
      || typeof row.supportedTarget !== 'boolean'
      || !['exact_official', 'synthetic_conservative', 'unusable'].includes(row.quality)
      || typeof row.exactMemberInterval !== 'boolean'
      || (row.officialCutoffAt !== null && typeof row.officialCutoffAt !== 'string')
      || typeof row.allFeatureSourcesAtOrBeforeCutoff !== 'boolean'
      || typeof row.finalTestCandidate !== 'boolean'
    ) {
      throw new Error(`invalid provenance row at index ${index}`);
    }
  }
}

export function buildProvenanceAuditReport(
  document: ProvenanceAuditDocument,
): ProvenanceAuditReport {
  if (document.schemaVersion !== PROVENANCE_AUDIT_SCHEMA_VERSION) {
    throw new Error(`unsupported provenance audit schema ${document.schemaVersion}`);
  }
  if (!Number.isInteger(document.congress) || document.congress < 1) {
    throw new Error('provenance audit congress must be a positive integer');
  }
  if (!Number.isFinite(Date.parse(document.generatedAt))) {
    throw new Error('provenance audit generatedAt must be an ISO timestamp');
  }
  assertAuditShape(document);

  const ids = new Set<string>();
  for (const row of document.rows) {
    if (row.congress !== document.congress) {
      throw new Error(`row ${row.id} belongs to Congress ${row.congress}`);
    }
    if (!row.id || ids.has(row.id)) throw new Error(`duplicate or missing row id ${row.id}`);
    ids.add(row.id);
  }

  const sourceBlockers = document.sources.filter((source) => source.status === 'blocked');
  const gate = evaluateProvenanceGate(document.rows);
  return {
    schemaVersion: document.schemaVersion,
    congress: document.congress,
    generatedAt: document.generatedAt,
    decision: sourceBlockers.length === 0 && gate.passes ? 'GO' : 'NO_GO',
    sourceBlockers,
    gate,
  };
}
