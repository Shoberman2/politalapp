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
  if (!Array.isArray(document.sources) || !Array.isArray(document.rows)) {
    throw new Error('provenance audit sources and rows must be arrays');
  }

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
