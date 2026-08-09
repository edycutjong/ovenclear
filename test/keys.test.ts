import { describe, expect, it } from 'vitest';
import {
  AgentKeyring,
  privateKeyFromSeed,
  publicKeyRawHex,
  signHex,
  verifyHex,
} from '../src/core/util/keys';

describe('ed25519 keys (node:crypto)', () => {
  it('derives deterministic per-agent keys from a namespace', () => {
    const a = AgentKeyring.deterministic('test-ns');
    const b = AgentKeyring.deterministic('test-ns');
    expect(a.publicKeyHex('verdict_agent')).toBe(b.publicKeyHex('verdict_agent'));
    expect(a.publicKeyHex('verdict_agent')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives different agents different keys', () => {
    const kr = AgentKeyring.deterministic('test-ns');
    expect(kr.publicKeyHex('verdict_agent')).not.toBe(kr.publicKeyHex('pricing_agent'));
  });

  it('signs and verifies', () => {
    const kr = AgentKeyring.deterministic('test-ns');
    const { signatureHex, publicKeyHex } = kr.sign('qa_agent', 'hello world');
    expect(verifyHex(publicKeyHex, 'hello world', signatureHex)).toBe(true);
  });

  it('rejects a tampered message and a wrong key', () => {
    const kr = AgentKeyring.deterministic('test-ns');
    const { signatureHex, publicKeyHex } = kr.sign('qa_agent', 'hello world');
    expect(verifyHex(publicKeyHex, 'hello worlds', signatureHex)).toBe(false);
    const otherPub = kr.publicKeyHex('other_agent');
    expect(verifyHex(otherPub, 'hello world', signatureHex)).toBe(false);
  });

  it('privateKeyFromSeed requires exactly 32 bytes and is deterministic', () => {
    expect(() => privateKeyFromSeed(Buffer.alloc(31))).toThrow(/32 bytes/);
    const seed = Buffer.alloc(32, 7);
    const p1 = publicKeyRawHex(privateKeyFromSeed(seed));
    const p2 = publicKeyRawHex(privateKeyFromSeed(seed));
    expect(p1).toBe(p2);
    const sig = signHex(privateKeyFromSeed(seed), 'msg');
    expect(verifyHex(p1, 'msg', sig)).toBe(true);
  });

  it('random keyring produces keys distinct from the deterministic namespace', () => {
    const det = AgentKeyring.deterministic('test-ns');
    const rnd = AgentKeyring.random();
    expect(rnd.publicKeyHex('verdict_agent')).not.toBe(det.publicKeyHex('verdict_agent'));
  });

  it('publicKeys() reports only materialized agents', () => {
    const kr = AgentKeyring.deterministic('test-ns');
    kr.sign('a1', 'x');
    kr.publicKeyHex('a2');
    expect(Object.keys(kr.publicKeys()).sort()).toEqual(['a1', 'a2']);
  });
});
