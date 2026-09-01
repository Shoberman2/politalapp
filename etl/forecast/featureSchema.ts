import { canonicalJson, sha256Canonical, type CanonicalValue } from './canonicalJson.js';

export const FEATURE_SCHEMA_VERSION = 'forecast-features-v1';

export type CutoffQuality = 'official_schedule' | 'synthetic_conservative';

export interface SourceRevision {
  source: string;
  sourceUrl: string;
  availableAt: string;
  revisionId: string;
}

export interface FeatureSnapshotInput {
  sourceEventId?: string;
  rollCallId?: string;
  featureCutoffAt: string;
  cutoffQuality: CutoffQuality;
  eventFeatures: Record<string, CanonicalValue>;
  eventSources: SourceRevision[];
  memberRows: Array<{
    politicianId: string;
    features: Record<string, CanonicalValue>;
    sources: SourceRevision[];
  }>;
}

export interface CanonicalFeatureSnapshot {
  featureSchemaVersion: string;
  sourceEventId: string | null;
  rollCallId: string | null;
  featureCutoffAt: string;
  cutoffQuality: CutoffQuality;
  canonicalEventFeatures: string;
  canonicalEventSources: string;
  eventSha256: string;
  rosterSha256: string;
  rows: Array<{
    politicianId: string;
    canonicalMemberFeatures: string;
    canonicalMemberSources: string;
    rowSha256: string;
  }>;
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${label} is not an ISO timestamp`);
  return timestamp;
}

function assertSourceCutoff(sources: SourceRevision[], cutoffMs: number, context: string): void {
  for (const source of sources) {
    if (!source.source || !source.sourceUrl || !source.revisionId) {
      throw new Error(`${context} source provenance is incomplete`);
    }
    if (!source.availableAt) throw new Error(`${context} source timestamp is missing`);
    const availableMs = parseTimestamp(source.availableAt, `${context} availableAt`);
    if (availableMs > cutoffMs) {
      throw new Error(`${context} source ${source.source} is newer than feature cutoff`);
    }
  }
}

function sortedSources(sources: SourceRevision[]): SourceRevision[] {
  return [...sources].sort((a, b) => {
    const left = [a.source, a.revisionId, a.availableAt, a.sourceUrl].join('\u0000');
    const right = [b.source, b.revisionId, b.availableAt, b.sourceUrl].join('\u0000');
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function buildCanonicalFeatureSnapshot(
  input: FeatureSnapshotInput,
): CanonicalFeatureSnapshot {
  if (Boolean(input.sourceEventId) === Boolean(input.rollCallId)) {
    throw new Error('exactly one of sourceEventId or rollCallId is required');
  }
  if (input.memberRows.length === 0) throw new Error('memberRows must not be empty');

  const cutoffMs = parseTimestamp(input.featureCutoffAt, 'featureCutoffAt');
  const eventSources = sortedSources(input.eventSources);
  assertSourceCutoff(eventSources, cutoffMs, 'event');

  const canonicalEventFeatures = canonicalJson(input.eventFeatures);
  const canonicalEventSources = canonicalJson(eventSources);
  const eventSha256 = sha256Canonical({
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    features: input.eventFeatures,
    sources: eventSources,
  });

  const seen = new Set<string>();
  const rows = [...input.memberRows]
    .sort((a, b) =>
      a.politicianId < b.politicianId ? -1 : a.politicianId > b.politicianId ? 1 : 0,
    )
    .map((row) => {
      if (!row.politicianId) throw new Error('member row politicianId is required');
      if (seen.has(row.politicianId)) throw new Error(`duplicate member ${row.politicianId}`);
      seen.add(row.politicianId);
      const sources = sortedSources(row.sources);
      assertSourceCutoff(sources, cutoffMs, `member ${row.politicianId}`);
      return {
        politicianId: row.politicianId,
        canonicalMemberFeatures: canonicalJson(row.features),
        canonicalMemberSources: canonicalJson(sources),
        rowSha256: sha256Canonical({
          eventSha256,
          politicianId: row.politicianId,
          features: row.features,
          sources,
        }),
      };
    });

  return {
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    sourceEventId: input.sourceEventId ?? null,
    rollCallId: input.rollCallId ?? null,
    featureCutoffAt: new Date(cutoffMs).toISOString(),
    cutoffQuality: input.cutoffQuality,
    canonicalEventFeatures,
    canonicalEventSources,
    eventSha256,
    rosterSha256: sha256Canonical(rows.map((row) => row.rowSha256)),
    rows,
  };
}
