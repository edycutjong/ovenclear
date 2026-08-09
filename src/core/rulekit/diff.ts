import { sha256Hex } from '../util/canonical';
import type { SnapshotRecord } from '../snapshots/store';
import type { RuleDelta } from './types';

/**
 * `diff(snapA, snapB) → RuleDelta[]` — deterministic line-level diff between
 * two snapshots of the same source (COMPLEXITY.md §4, the offline materiality
 * engine's input). LCS over lines; consecutive removed+added runs inside a
 * hunk are paired into 'changed' deltas so the classifier sees before/after.
 */

const EXCERPT_MAX = 240;

export function diffSnapshots(from: SnapshotRecord, to: SnapshotRecord): RuleDelta[] {
  if (from.state !== to.state) {
    throw new Error(`cannot diff snapshots across states (${from.state} vs ${to.state})`);
  }
  const a = splitLines(from.content);
  const b = splitLines(to.content);
  const ops = diffLines(a, b);

  // Track section headings while walking ops.
  const deltas: RuleDelta[] = [];
  let section = '(preamble)';
  let i = 0;
  while (i < ops.length) {
    const op = ops[i]!;
    if (op.type === 'equal') {
      section = sectionOf(op.line) ?? section;
      i++;
      continue;
    }
    // collect a contiguous hunk of removed/added
    const removed: string[] = [];
    const added: string[] = [];
    let j = i;
    while (j < ops.length && ops[j]!.type !== 'equal') {
      const cur = ops[j]!;
      if (cur.type === 'removed') removed.push(cur.line);
      else added.push(cur.line);
      j++;
    }
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) {
      const before = removed[k]!;
      const after = added[k]!;
      if (before === after) continue;
      deltas.push(makeDelta(from, to, 'changed', section, before, after));
    }
    for (let k = pairs; k < removed.length; k++) {
      deltas.push(makeDelta(from, to, 'removed', section, removed[k]!, null));
    }
    for (let k = pairs; k < added.length; k++) {
      const line = added[k]!;
      deltas.push(makeDelta(from, to, 'added', sectionOf(line) ?? section, null, line));
      section = sectionOf(line) ?? section;
    }
    // removed lines may have carried section headings; update from the last removed heading
    for (const line of removed) section = sectionOf(line) ?? section;
    i = j;
  }
  return deltas;
}

function makeDelta(
  from: SnapshotRecord,
  to: SnapshotRecord,
  kind: RuleDelta['kind'],
  section: string,
  before: string | null,
  after: string | null,
): RuleDelta {
  const excerptRaw = [
    before !== null ? `- ${before}` : null,
    after !== null ? `+ ${after}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join('\n');
  const excerpt = excerptRaw.length > EXCERPT_MAX ? `${excerptRaw.slice(0, EXCERPT_MAX - 1)}…` : excerptRaw;
  const fingerprint = sha256Hex(`${kind}|${section}|${before ?? ''}|${after ?? ''}`).slice(0, 10);
  return {
    id: `d-${to.state.toLowerCase()}-${fingerprint}`,
    state: to.state,
    fromSnapshotHash: from.contentSha256,
    toSnapshotHash: to.contentSha256,
    kind,
    section,
    before,
    after,
    excerpt,
  };
}

function sectionOf(line: string): string | null {
  const m = /^\s*(Section\s+\d+[A-Za-z0-9.]*\.?\s*[^.]*)/.exec(line);
  if (m && /^\s*Section\s+\d+/.test(line)) return m[1]!.trim().replace(/\s+/g, ' ');
  return null;
}

function splitLines(content: string): string[] {
  return content.split('\n').map((l) => l.replace(/[ \t]+$/, ''));
}

type Op = { type: 'equal' | 'removed' | 'added'; line: string };

/** Classic LCS diff (fixture docs are small; O(n·m) is fine and dependency-free). */
function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = LCS length of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i]!;
    const next = lcs[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', line: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: 'removed', line: a[i]! });
      i++;
    } else {
      ops.push({ type: 'added', line: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'removed', line: a[i++]! });
  while (j < m) ops.push({ type: 'added', line: b[j++]! });
  return ops;
}
