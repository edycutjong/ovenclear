import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from 'node:crypto';

/**
 * Ed25519 signing utilities built on node:crypto (no third-party crypto).
 *
 * FIXTURE POSTURE: `AgentKeyring.deterministic()` derives agent keys from a
 * public namespace string so seed fixtures and ledger exports are byte-stable
 * across runs. That is intentionally NOT a production key-management scheme —
 * the production plan (ARCHITECTURE.md) holds agent keys in Cloud KMS.
 * `AgentKeyring.random()` exists for realistic key handling.
 */

// PKCS#8 DER prefix for a raw 32-byte Ed25519 private seed.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
// SPKI DER prefix for a raw 32-byte Ed25519 public key.
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function privateKeyFromSeed(seed32: Buffer): KeyObject {
  if (seed32.length !== 32) throw new Error('ed25519 seed must be exactly 32 bytes');
  return createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed32]),
    format: 'der',
    type: 'pkcs8',
  });
}

export function publicKeyRawHex(priv: KeyObject): string {
  const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' }) as Buffer;
  return spki.subarray(SPKI_ED25519_PREFIX.length).toString('hex');
}

export function publicKeyFromRawHex(rawHex: string): KeyObject {
  const raw = Buffer.from(rawHex, 'hex');
  if (raw.length !== 32) throw new Error('ed25519 raw public key must be 32 bytes');
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

export function signHex(priv: KeyObject, message: string | Buffer): string {
  const data = typeof message === 'string' ? Buffer.from(message, 'utf8') : message;
  return edSign(null, data, priv).toString('hex');
}

export function verifyHex(
  publicKeyHex: string,
  message: string | Buffer,
  signatureHex: string,
): boolean {
  try {
    const data = typeof message === 'string' ? Buffer.from(message, 'utf8') : message;
    return edVerify(null, data, publicKeyFromRawHex(publicKeyHex), Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

export interface AgentKey {
  agent: string;
  publicKeyHex: string;
}

/** Per-agent Ed25519 keyring. Keys are created lazily on first use. */
export class AgentKeyring {
  private readonly keys = new Map<string, { priv: KeyObject; publicKeyHex: string }>();
  private constructor(private readonly seedNamespace: string | null) {}

  /** Deterministic keyring: seed = SHA-256(`${namespace}:ed25519:${agent}`). Fixture-only. */
  static deterministic(namespace = 'ovenclear-fixture'): AgentKeyring {
    return new AgentKeyring(namespace);
  }

  /** Random keyring (fresh OS-entropy keys per agent). */
  static random(): AgentKeyring {
    return new AgentKeyring(null);
  }

  private materialize(agent: string): { priv: KeyObject; publicKeyHex: string } {
    const existing = this.keys.get(agent);
    if (existing) return existing;
    let priv: KeyObject;
    if (this.seedNamespace !== null) {
      const seed = createHash('sha256')
        .update(`${this.seedNamespace}:ed25519:${agent}`, 'utf8')
        .digest();
      priv = privateKeyFromSeed(seed);
    } else {
      priv = generateKeyPairSync('ed25519').privateKey;
    }
    const entry = { priv, publicKeyHex: publicKeyRawHex(priv) };
    this.keys.set(agent, entry);
    return entry;
  }

  publicKeyHex(agent: string): string {
    return this.materialize(agent).publicKeyHex;
  }

  sign(agent: string, message: string | Buffer): { signatureHex: string; publicKeyHex: string } {
    const { priv, publicKeyHex } = this.materialize(agent);
    return { signatureHex: signHex(priv, message), publicKeyHex };
  }

  /** All agent public keys materialized so far. */
  publicKeys(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [agent, { publicKeyHex }] of this.keys) out[agent] = publicKeyHex;
    return out;
  }
}
