import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../src/core/snapshots/store';
import { diffSnapshots } from '../src/core/rulekit/diff';
import { registerFixtureSnapshots } from '../src/fixtures/snapshots';

function snap(state: string, id: string, content: string, fetchedAt = '2026-07-01T00:00:00.000Z') {
  const store = new SnapshotStore();
  return store.put({ id, state, url: `https://fixture.example/${state.toLowerCase()}`, fetchedAt, content, fixture: true });
}

describe('diffSnapshots — deterministic line diff', () => {
  it('returns no deltas for identical content', () => {
    const a = snap('GA', 'a', 'Section 1. Same.\n1.1 Text.');
    const b = snap('GA', 'b', 'Section 1. Same.\n1.1 Text.');
    expect(diffSnapshots(a, b)).toEqual([]);
  });

  it('detects added and removed lines with section attribution', () => {
    const a = snap('GA', 'a', 'Section 1. Fees.\n1.1 Old duty.');
    const b = snap('GA', 'b', 'Section 1. Fees.\n1.1 Old duty.\n1.2 New duty added.');
    const added = diffSnapshots(a, b);
    expect(added).toHaveLength(1);
    expect(added[0]!.kind).toBe('added');
    expect(added[0]!.after).toBe('1.2 New duty added.');
    expect(added[0]!.section).toMatch(/Section 1/);

    const removed = diffSnapshots(b, a);
    expect(removed).toHaveLength(1);
    expect(removed[0]!.kind).toBe('removed');
    expect(removed[0]!.before).toBe('1.2 New duty added.');
  });

  it('pairs replaced lines into "changed" deltas with before/after', () => {
    const a = snap('TX', 'a', 'Section 2. Cap.\n2.1 Cap is $25,000.');
    const b = snap('TX', 'b', 'Section 2. Cap.\n2.1 Cap is $50,000.');
    const deltas = diffSnapshots(a, b);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.kind).toBe('changed');
    expect(deltas[0]!.before).toContain('$25,000');
    expect(deltas[0]!.after).toContain('$50,000');
    expect(deltas[0]!.excerpt).toContain('- 2.1 Cap is $25,000.');
    expect(deltas[0]!.excerpt).toContain('+ 2.1 Cap is $50,000.');
  });

  it('produces exactly the 5 changed deltas for the TX historical replay pair', () => {
    const store = new SnapshotStore();
    const snaps = registerFixtureSnapshots(store);
    const deltas = diffSnapshots(snaps.txBefore, snaps.txAfter);
    expect(deltas).toHaveLength(5);
    expect(deltas.every((d) => d.kind === 'changed')).toBe(true);
    const texts = deltas.map((d) => `${d.before} => ${d.after}`).join('\n');
    expect(texts).toMatch(/Pickled, fermented, or acidified/); // eligibility
    expect(texts).toMatch(/exact statement/); // label wording
    expect(texts).toMatch(/555-0134/); // phone churn
    expect(texts).toMatch(/Office hours/); // hours churn
    expect(texts).toMatch(/Sales {2}venues|Sales venues/); // cosmetic heading
    // provenance: every delta pins both content hashes
    for (const d of deltas) {
      expect(d.fromSnapshotHash).toBe(snaps.txBefore.contentSha256);
      expect(d.toSnapshotHash).toBe(snaps.txAfter.contentSha256);
    }
  });

  it('attributes TX replay deltas to the right sections', () => {
    const store = new SnapshotStore();
    const snaps = registerFixtureSnapshots(store);
    const deltas = diffSnapshots(snaps.txBefore, snaps.txAfter);
    const eligibility = deltas.find((d) => d.before?.includes('Pickled'));
    expect(eligibility?.section).toMatch(/Section 3/);
    const statement = deltas.find((d) => d.before?.includes('exact statement'));
    expect(statement?.section).toMatch(/Section 6/);
  });

  it('truncates excerpts and keeps ids deterministic across runs', () => {
    const long = 'x'.repeat(400);
    const a = snap('GA', 'a', `Section 1. Long.\n1.1 ${long}A.`);
    const b = snap('GA', 'b', `Section 1. Long.\n1.1 ${long}B.`);
    const [d1] = diffSnapshots(a, b);
    const [d2] = diffSnapshots(a, b);
    expect(d1!.excerpt.length).toBeLessThanOrEqual(240);
    expect(d1!.id).toBe(d2!.id);
    expect(d1!.id).toMatch(/^d-ga-[0-9a-f]{10}$/);
  });

  it('refuses to diff snapshots across states', () => {
    const a = snap('GA', 'a', 'x');
    const b = snap('TX', 'b', 'y');
    expect(() => diffSnapshots(a, b)).toThrow(/across states/);
  });
});
