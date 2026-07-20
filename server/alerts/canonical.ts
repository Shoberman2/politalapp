import { createHash } from 'node:crypto';

const BILL_TYPE_MAP: Record<string, string> = {
  hr: 'hr',
  s: 's',
  hjres: 'hjres',
  sjres: 'sjres',
  hconres: 'hconres',
  sconres: 'sconres',
  hres: 'hres',
  sres: 'sres',
};

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => (
    `${JSON.stringify(key)}:${stableJson(object[key])}`
  )).join(',')}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function contentHash(payload: unknown): string {
  return sha256(stableJson(payload));
}

export function canonicalBillId(
  congress: string | number,
  type: string,
  number: string | number,
): string | null {
  const normalizedType = type.toLowerCase().replace(/[^a-z]/g, '');
  const canonicalType = BILL_TYPE_MAP[normalizedType];
  const normalizedCongress = String(congress).replace(/\D/g, '');
  const normalizedNumber = String(number).replace(/\D/g, '');
  if (!canonicalType || !normalizedCongress || !normalizedNumber) return null;
  return `${normalizedCongress}-${canonicalType}-${Number(normalizedNumber)}`;
}

export function billIdFromLabel(congress: string | number, label: string): string | null {
  const match = label.trim().match(
    /^(H\.?\s*R\.?|S\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?|H\.?\s*Con\.?\s*Res\.?|S\.?\s*Con\.?\s*Res\.?|H\.?\s*Res\.?|S\.?\s*Res\.?)\s*(\d+)/i,
  );
  if (!match) return null;
  return canonicalBillId(congress, match[1], match[2]);
}

export function eventKey(value: Record<string, unknown>): string {
  return sha256(stableJson({ version: 1, ...value }));
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function normalizeHttpsUrl(value: string): string {
  return value.replace(/^http:\/\//i, 'https://');
}

export function currentCongress(now = new Date()): number {
  // The 119th Congress began in 2025; every Congress lasts two years.
  return 119 + Math.floor((now.getUTCFullYear() - 2025) / 2);
}
