import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, canonicalHash, canonicalJson, must, sha256Hex } from '../src/core/util/canonical';

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('emits no insignificant whitespace and preserves array order', () => {
    expect(canonicalJson([3, 1, { z: true, a: null }])).toBe('[3,1,{"a":null,"z":true}]');
  });

  it('omits undefined-valued object properties (JSON semantics)', () => {
    expect(canonicalJson({ a: 1, gone: undefined })).toBe('{"a":1}');
  });

  it('rejects undefined inside arrays instead of coercing to null', () => {
    expect(() => canonicalJson([1, undefined, 3])).toThrow(/undefined array element/);
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ x: Infinity })).toThrow(/non-finite/);
  });

  it('rejects types that must be pre-serialized', () => {
    expect(() => canonicalJson({ x: 1n })).toThrow(/bigint/);
    expect(() => canonicalJson({ x: () => 1 })).toThrow(/function/);
    expect(() => canonicalJson({ x: new Date() })).toThrow(/Date/);
    expect(() => canonicalJson({ x: new Map() })).toThrow(/Map/);
    expect(() => canonicalJson({ x: new Set() })).toThrow(/Set/);
  });

  it('rejects cycles', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => canonicalJson(a)).toThrow(/cycle/);
  });

  it('is stable for unicode strings', () => {
    expect(canonicalJson({ s: 'Rosa’s Bakes \u{1F35E}' })).toBe(JSON.stringify({ s: 'Rosa’s Bakes 🍞' }));
  });
});

describe('sha256Hex / canonicalHash', () => {
  it('matches known SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('canonicalHash is key-order independent', () => {
    expect(canonicalHash({ a: 1, b: [true, 'x'] })).toBe(canonicalHash({ b: [true, 'x'], a: 1 }));
  });

  it('GENESIS_HASH is 64 zero hex chars', () => {
    expect(GENESIS_HASH).toMatch(/^0{64}$/);
  });
});

describe('must', () => {
  it('returns present values and throws on absent ones', () => {
    expect(must(5, 'x')).toBe(5);
    expect(() => must(undefined, 'boom')).toThrow(/invariant: boom/);
    expect(() => must(null, 'boom')).toThrow(/invariant: boom/);
  });
});
