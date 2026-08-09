import { GENESIS_HASH } from '../util/canonical';
import { verifyHex } from '../util/keys';
import { computeEntryHash, DecisionLedger, type LedgerEntry } from './ledger';
import { dailyRoots, type DailyRoot } from './merkle';

/**
 * `verifyChain(export) → ChainReport` (COMPLEXITY.md §4).
 * Recomputes every hash, checks linkage + seq contiguity, verifies every
 * Ed25519 signature, and (optionally) checks each agent's public key against
 * a trusted key map. Localizes the first bad row.
 */

export interface ChainProblem {
  seq: number;
  reason: string;
}

export interface ChainReport {
  ok: boolean;
  length: number;
  agents: string[];
  signaturesChecked: number;
  problems: ChainProblem[];
  firstBadSeq: number | null;
  dailyRoots: DailyRoot[];
  lastHash: string;
}

export function verifyChain(
  input: string | readonly LedgerEntry[],
  opts?: { trustedKeys?: Record<string, string> },
): ChainReport {
  const entries: readonly LedgerEntry[] =
    typeof input === 'string' ? DecisionLedger.parseJsonl(input) : input;
  const problems: ChainProblem[] = [];
  const agents = new Set<string>();
  let signaturesChecked = 0;
  let prevHash = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    agents.add(e.agent);
    if (e.seq !== i) {
      problems.push({ seq: i, reason: `seq mismatch: expected ${i}, row says ${e.seq} (reorder/omission)` });
    }
    if (e.prevHash !== prevHash) {
      problems.push({ seq: i, reason: `prevHash mismatch: expected ${prevHash.slice(0, 12)}…, row says ${e.prevHash.slice(0, 12)}…` });
    }
    const recomputed = computeEntryHash(
      { seq: e.seq, ts: e.ts, agent: e.agent, kind: e.kind, payload: e.payload },
      e.prevHash,
    );
    if (recomputed !== e.entryHash) {
      problems.push({ seq: i, reason: 'entryHash does not recompute (payload or metadata tampered)' });
    }
    signaturesChecked++;
    if (!verifyHex(e.publicKey, e.entryHash, e.signature)) {
      problems.push({ seq: i, reason: 'ed25519 signature invalid' });
    }
    const trusted = opts?.trustedKeys?.[e.agent];
    if (trusted !== undefined && trusted !== e.publicKey) {
      problems.push({ seq: i, reason: `agent "${e.agent}" signed with untrusted key` });
    }
    prevHash = e.entryHash;
  }

  const sortedProblems = [...problems].sort((a, b) => a.seq - b.seq);
  return {
    ok: problems.length === 0,
    length: entries.length,
    agents: [...agents].sort(),
    signaturesChecked,
    problems: sortedProblems,
    firstBadSeq: sortedProblems.length ? sortedProblems[0]!.seq : null,
    dailyRoots: entries.length ? dailyRoots(entries) : [],
    lastHash: entries.length ? entries[entries.length - 1]!.entryHash : GENESIS_HASH,
  };
}
