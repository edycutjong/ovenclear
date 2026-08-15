import { GENESIS_HASH, canonicalJson, sha256Hex } from '../util/canonical';
import { verifyHex, type AgentKeyring } from '../util/keys';

/**
 * Decision ledger — append-only, hash-chained, per-agent Ed25519-signed
 * (COMPLEXITY.md §2).
 *
 * Chain formula (exactly as specified):
 *   entry_hash = SHA-256( prev_hash ∥ canonical_json(entry_core) )
 * where entry_core = { seq, ts, agent, kind, payload } (canonical JSON,
 * sorted keys) and prev_hash is the previous row's entry_hash (genesis:
 * 64 zero hex chars). The signature is Ed25519 over the UTF-8 bytes of
 * entry_hash, by the acting agent's key.
 */

export interface LedgerEntryCore {
  seq: number;
  ts: string; // ISO-8601 UTC
  agent: string;
  kind: string;
  payload: unknown;
}

export interface LedgerEntry extends LedgerEntryCore {
  prevHash: string;
  entryHash: string;
  signature: string; // hex
  publicKey: string; // hex (raw 32-byte ed25519)
}

export type LedgerClock = () => string;

export function computeEntryHash(core: LedgerEntryCore, prevHash: string): string {
  return sha256Hex(prevHash + canonicalJson(core));
}

export class DecisionLedger {
  private readonly entries: LedgerEntry[] = [];
  private readonly clock: LedgerClock;

  constructor(
    private readonly keyring: AgentKeyring,
    clock?: LedgerClock,
  ) {
    this.clock = clock ?? (() => new Date().toISOString());
  }

  append(agent: string, kind: string, payload: unknown): LedgerEntry {
    if (!agent.trim()) throw new Error('ledger: agent required');
    if (!kind.trim()) throw new Error('ledger: kind required');
    const prevHash = this.entries.length
      ? this.entries[this.entries.length - 1]!.entryHash
      : GENESIS_HASH;
    const core: LedgerEntryCore = {
      seq: this.entries.length,
      ts: this.clock(),
      agent,
      kind,
      payload,
    };
    const entryHash = computeEntryHash(core, prevHash);
    const { signatureHex, publicKeyHex } = this.keyring.sign(agent, entryHash);
    const entry: LedgerEntry = {
      ...core,
      prevHash,
      entryHash,
      signature: signatureHex,
      publicKey: publicKeyHex,
    };
    this.entries.push(entry);
    return entry;
  }

  get size(): number {
    return this.entries.length;
  }

  get lastHash(): string {
    return this.entries.length ? this.entries[this.entries.length - 1]!.entryHash : GENESIS_HASH;
  }

  at(seq: number): LedgerEntry {
    const e = this.entries[seq];
    if (!e) throw new Error(`ledger: no entry at seq ${seq}`);
    return e;
  }

  tail(n: number): LedgerEntry[] {
    return this.entries.slice(Math.max(0, this.entries.length - n));
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  byKind(kind: string): LedgerEntry[] {
    return this.entries.filter((e) => e.kind === kind);
  }

  /** JSONL export — one signed entry per line (the /verify download). */
  toJsonl(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n');
  }

  static parseJsonl(text: string): LedgerEntry[] {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LedgerEntry);
  }

  /**
   * Rehydrate a ledger from a previously exported chain so a long-running
   * server can restart without breaking linkage (the in-memory `entries`
   * array is what `append` chains from).
   *
   * The chain is re-verified on the way in — hash linkage, seq contiguity and
   * every Ed25519 signature — and restore FAILS CLOSED on the first bad row
   * rather than silently continuing a corrupted chain. This is the same
   * check `verifyChain` performs; it is duplicated here (rather than
   * imported) only to keep ledger.ts free of a cycle with verify.ts.
   */
  static restore(
    entries: readonly LedgerEntry[],
    keyring: AgentKeyring,
    clock?: LedgerClock,
  ): DecisionLedger {
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      if (e.seq !== i) {
        throw new Error(`ledger restore: seq mismatch at row ${i} (row says ${e.seq})`);
      }
      if (e.prevHash !== prevHash) {
        throw new Error(`ledger restore: prevHash mismatch at seq ${i}`);
      }
      const recomputed = computeEntryHash(
        { seq: e.seq, ts: e.ts, agent: e.agent, kind: e.kind, payload: e.payload },
        e.prevHash,
      );
      if (recomputed !== e.entryHash) {
        throw new Error(`ledger restore: entryHash does not recompute at seq ${i} (tampered)`);
      }
      if (!verifyHex(e.publicKey, e.entryHash, e.signature)) {
        throw new Error(`ledger restore: ed25519 signature invalid at seq ${i}`);
      }
      prevHash = e.entryHash;
    }
    const ledger = new DecisionLedger(keyring, clock);
    ledger.entries.push(...entries);
    return ledger;
  }
}
