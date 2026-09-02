import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Canonical } from '../../etl/forecast/canonicalJson.js';

describe('canonicalJson', () => {
  it('sorts object keys recursively and preserves array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 }, rows: [2, 1] })).toBe(
      '{"a":{"b":3,"y":2},"rows":[2,1],"z":1}',
    );
  });

  it('normalizes Unicode strings and negative zero', () => {
    expect(canonicalJson({ value: -0, text: 'e\u0301' })).toBe('{"text":"é","value":0}');
  });

  it('produces stable hashes for semantically identical key order', () => {
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(sha256Canonical({ a: 1, b: 2 }));
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite number %s', (value) => {
    expect(() => canonicalJson({ value })).toThrow(/non-finite/);
  });

  it('rejects undefined and non-plain objects', () => {
    expect(() => canonicalJson({ value: undefined })).toThrow(/undefined/);
    expect(() => canonicalJson(new Date())).toThrow(/plain objects/);
  });

  it.each([1n, Symbol('value'), () => 'value'])(
    'rejects unsupported primitive %s',
    (value) => {
      expect(() => canonicalJson({ value })).toThrow(/unsupported type/);
    },
  );

  it('rejects keys that collide after Unicode normalization', () => {
    expect(() => canonicalJson({ 'é': 1, 'e\u0301': 2 })).toThrow(/canonically duplicate key/);
  });
});
