import { sha256Hex } from '../util/canonical';
import type { LedgerEntry } from './ledger';

/**
 * Daily Merkle roots over ledger entry hashes (COMPLEXITY.md §2: "daily
 * Merkle root on /verify"). Domain-separated leaf/node hashing prevents
 * second-preimage tricks between leaves and interior nodes.
 */

export function merkleRoot(entryHashes: string[]): string {
  if (entryHashes.length === 0) throw new Error('merkleRoot: at least one leaf required');
  let level = entryHashes.map((h) => sha256Hex(`leaf:${h}`));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left; // duplicate last when odd
      next.push(sha256Hex(`node:${left}${right}`));
    }
    level = next;
  }
  return level[0]!;
}

export interface DailyRoot {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
  root: string;
}

export function dailyRoots(entries: readonly LedgerEntry[]): DailyRoot[] {
  const byDate = new Map<string, string[]>();
  for (const e of entries) {
    const date = e.ts.slice(0, 10);
    const bucket = byDate.get(date);
    if (bucket) bucket.push(e.entryHash);
    else byDate.set(date, [e.entryHash]);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, hashes]) => ({ date, count: hashes.length, root: merkleRoot(hashes) }));
}
