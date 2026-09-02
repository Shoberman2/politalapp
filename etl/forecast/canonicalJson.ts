import { createHash } from 'node:crypto';

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalize(value: unknown, path: string): CanonicalValue {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFKC');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalize(item, `${path}[${index}]`));
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain objects`);
    }
    const output: Record<string, CanonicalValue> = {};
    const normalizedKeys = Object.keys(value as Record<string, unknown>)
      .map((original) => ({ original, normalized: original.normalize('NFKC') }))
      .sort((a, b) => (a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0));
    for (const { original, normalized: key } of normalizedKeys) {
      if (Object.prototype.hasOwnProperty.call(output, key)) {
        throw new TypeError(`${path} has canonically duplicate key ${key}`);
      }
      const child = (value as Record<string, unknown>)[original];
      if (child === undefined) throw new TypeError(`${path}.${key} is undefined`);
      output[key] = normalize(child, `${path}.${key}`);
    }
    return output;
  }
  throw new TypeError(`${path} contains unsupported type ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, '$'));
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
