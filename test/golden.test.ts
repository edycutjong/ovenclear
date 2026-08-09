import { describe, expect, it } from 'vitest';
import { buildWorld } from '../src/fixtures/world';
import { GOLDEN_CASES } from '../src/fixtures/golden';
import type { Verdict } from '../src/core/rulekit/types';

/**
 * Golden verdict suite — the Layer-4 eval (COMPLEXITY.md §5).
 * Every case is pinned to a pack version; the aggregate test asserts ZERO
 * verdict flips against ground truth. This is the regression net that keeps
 * the engine from becoming a yes-machine.
 */

const world = buildWorld({ includeAmendedTx: true });

function run(c: (typeof GOLDEN_CASES)[number]): Verdict {
  return world.engine.check({
    state: c.state,
    product: c.product,
    venue: c.venue,
    packVersion: c.packVersion,
    issuedAt: '2026-07-04T00:00:00.000Z',
  });
}

describe('golden verdict suite (26 cases, GA/TX deep + stub sanity)', () => {
  it.each(GOLDEN_CASES.map((c) => [c.id, c] as const))('%s — matches ground truth', (_id, c) => {
    const v = run(c);
    expect(v.status).toBe(c.expect.status);
    const citedIds = v.citations.map((x) => x.id);
    for (const requiredCite of c.expect.citesAll) {
      expect(citedIds).toContain(requiredCite);
    }
    expect(v.conditions).toHaveLength(c.expect.conditionsCount);
    for (const kind of c.expect.reasonKinds ?? []) {
      expect(v.reasons.map((r) => r.kind)).toContain(kind);
    }
    // I1 on every golden verdict
    expect(v.snapshotHashes.length).toBeGreaterThan(0);
    expect(v.packVersion).toBe(c.packVersion);
  });

  it('has ZERO verdict flips across the whole suite (eval-runner aggregate)', () => {
    const flips = GOLDEN_CASES.filter((c) => run(c).status !== c.expect.status).map((c) => c.id);
    expect(flips).toEqual([]);
  });

  it('covers the tricky set the spec demands (cheesecake, pickles, mail-order)', () => {
    const text = GOLDEN_CASES.map((c) => `${c.product} ${c.venue}`).join(' | ');
    expect(text).toMatch(/cheesecake/);
    expect(text).toMatch(/pickles/);
    expect(text).toMatch(/mail_order_interstate/);
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(15); // spec floor for this session
  });

  it('verdict hashes are stable across a re-run (determinism for nightly evals)', () => {
    const first = GOLDEN_CASES.map((c) => run(c).verdictHash);
    const second = GOLDEN_CASES.map((c) => run(c).verdictHash);
    expect(first).toEqual(second);
  });
});
