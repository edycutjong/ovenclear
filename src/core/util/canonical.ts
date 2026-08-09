import { createHash } from 'node:crypto';

/**
 * Canonical JSON serialization.
 *
 * Rules:
 *  - object keys sorted lexicographically (code-unit order), recursively
 *  - no insignificant whitespace
 *  - `undefined`-valued object properties are OMITTED (JSON semantics)
 *  - `undefined` inside arrays is REJECTED (JSON.stringify would silently
 *    coerce to null, which is a canonicalization hazard)
 *  - non-finite numbers, BigInt, functions, symbols, Dates, Maps, Sets are
 *    REJECTED — callers must pre-serialize to plain JSON values
 *  - cycles are REJECTED
 *
 * Used for: ledger entry hashing, verdict/label content hashing, policy
 * envelope approval signatures, seed manifest hashing.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, new WeakSet(), '$');
}

function encode(value: unknown, seen: WeakSet<object>, path: string): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new TypeError(`canonicalJson: non-finite number at ${path}`);
    }
    return JSON.stringify(value);
  }
  if (t === 'bigint' || t === 'function' || t === 'symbol') {
    throw new TypeError(`canonicalJson: unsupported type ${t} at ${path}`);
  }
  if (t === 'undefined') {
    throw new TypeError(`canonicalJson: undefined is not serializable at ${path}`);
  }
  const obj = value as object;
  if (obj instanceof Date || obj instanceof Map || obj instanceof Set) {
    throw new TypeError(
      `canonicalJson: ${obj.constructor.name} must be pre-serialized at ${path}`,
    );
  }
  if (seen.has(obj)) throw new TypeError(`canonicalJson: cycle detected at ${path}`);
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (let i = 0; i < obj.length; i++) {
        const item: unknown = obj[i];
        if (item === undefined) {
          throw new TypeError(`canonicalJson: undefined array element at ${path}[${i}]`);
        }
        parts.push(encode(item, seen, `${path}[${i}]`));
      }
      return `[${parts.join(',')}]`;
    }
    const rec = obj as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = rec[k];
      if (v === undefined) continue; // omitted, like JSON.stringify
      parts.push(`${JSON.stringify(k)}:${encode(v, seen, `${path}.${k}`)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(obj);
  }
}

/** Hex-encoded SHA-256 of a UTF-8 string or Buffer. */
export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** SHA-256 of the canonical JSON form of a value. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** Genesis previous-hash for hash chains: 64 zero hex chars. */
export const GENESIS_HASH = '0'.repeat(64);

/** Narrowing helper for noUncheckedIndexedAccess-strict code. */
export function must<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null) throw new Error(`invariant: ${msg}`);
  return v;
}
