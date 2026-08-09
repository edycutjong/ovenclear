import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../src/core/snapshots/store';
import { RuleEngine } from '../src/core/rulekit/engine';
import {
  CoverageGapError,
  UnknownProductError,
  UnsupportedStateError,
} from '../src/core/rulekit/types';
import { GA_MANDATED_SENTENCE, TX_STATEMENT_AFTER, TX_STATEMENT_BEFORE, registerFixtureSnapshots } from '../src/fixtures/snapshots';
import { buildGaPack } from '../src/fixtures/rulepacks/ga';
import { buildTxPack } from '../src/fixtures/rulepacks/tx';
import { buildCaStubPack } from '../src/fixtures/rulepacks/stubs';

function makeEngine() {
  const store = new SnapshotStore();
  const snaps = registerFixtureSnapshots(store);
  const engine = new RuleEngine(store);
  engine.register(buildGaPack(snaps.ga));
  engine.register(buildTxPack(snaps.txBefore, '2026-06'));
  engine.register(buildTxPack(snaps.txAfter, '2026-07'));
  engine.register(buildCaStubPack(snaps.ca));
  return { engine, snaps };
}

describe('RuleEngine.check — verdict semantics', () => {
  it('GA sourdough @ farmers market is eligible and pins the snapshot hash (I1)', () => {
    const { engine, snaps } = makeEngine();
    const v = engine.check({ state: 'GA', product: 'sourdough', venue: 'farmers_market' });
    expect(v.status).toBe('eligible');
    expect(v.snapshotHashes).toEqual([snaps.ga.contentSha256]);
    expect(v.snapshotHashes.length).toBeGreaterThan(0); // invariant I1
    expect(v.product.canonical).toBe('sourdough bread');
    expect(v.fixture).toBe(true);
  });

  it('every citation resolves to a 64-hex snapshot hash matching the pack pin (I1)', () => {
    const { engine, snaps } = makeEngine();
    const v = engine.check({ state: 'GA', product: 'tomato jam', venue: 'farmers_market' });
    expect(v.citations.length).toBeGreaterThan(0);
    for (const c of v.citations) {
      expect(c.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
      expect(c.snapshotHash).toBe(snaps.ga.contentSha256);
    }
  });

  it('builds the 6-step GA checklist with license fees attached', () => {
    const { engine } = makeEngine();
    const v = engine.check({ state: 'GA', product: 'sourdough', venue: 'farmers_market' });
    expect(v.checklist).toHaveLength(6);
    expect(v.checklist[1]!.feeUsd).toBe(100); // apply for license
    expect(v.checklist[5]!.feeUsd).toBe(100); // renew annually
    expect(v.checklist.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('venue prohibition trumps an eligible product (GA sourdough via wholesale)', () => {
    const { engine } = makeEngine();
    const v = engine.check({ state: 'GA', product: 'sourdough', venue: 'wholesale' });
    expect(v.status).toBe('prohibited');
    const venueReason = v.reasons.find((r) => r.kind === 'venue');
    expect(venueReason?.citationIds).toContain('GA-CF-4.2');
    expect(venueReason?.message).toMatch(/prohibited/);
  });

  it('refuses cheesecake with the refrigeration rule quoted (the trust moment)', () => {
    const { engine } = makeEngine();
    const v = engine.check({ state: 'GA', product: 'cheesecake', venue: 'farmers_market' });
    expect(v.status).toBe('prohibited');
    const productReason = v.reasons.find((r) => r.kind === 'product');
    expect(productReason?.message).toMatch(/refrigeration/);
    const cited = v.citations.map((c) => c.id);
    expect(cited).toContain('GA-CF-1.2');
    expect(v.citations.find((c) => c.id === 'GA-CF-1.2')?.quote).toMatch(/time or temperature control/);
  });

  it('routes GA tomato jam to license_required with 2 lab/process conditions', () => {
    const { engine } = makeEngine();
    const v = engine.check({ state: 'GA', product: 'tomato jam', venue: 'farmers_market' });
    expect(v.status).toBe('license_required');
    expect(v.conditions).toHaveLength(2);
    expect(v.conditions.join(' ')).toMatch(/process authority/);
    expect(v.citations.map((c) => c.id)).toContain('GA-CF-2.2');
  });

  it('verdictHash is content-derived: stable across issue times, sensitive to inputs', () => {
    const { engine } = makeEngine();
    const a = engine.check({ state: 'GA', product: 'sourdough', venue: 'farmers_market', issuedAt: '2026-07-04T00:00:00.000Z' });
    const b = engine.check({ state: 'GA', product: 'sourdough', venue: 'farmers_market', issuedAt: '2026-08-01T12:34:56.000Z' });
    const c = engine.check({ state: 'GA', product: 'sourdough', venue: 'home_pickup', issuedAt: '2026-07-04T00:00:00.000Z' });
    expect(a.verdictHash).toBe(b.verdictHash);
    expect(a.verdictHash).not.toBe(c.verdictHash);
  });

  it('throws UnsupportedStateError for uncovered states', () => {
    const { engine } = makeEngine();
    expect(() => engine.check({ state: 'WY', product: 'sourdough', venue: 'farmers_market' })).toThrow(
      UnsupportedStateError,
    );
  });

  it('throws UnknownProductError for products outside the catalog', () => {
    const { engine } = makeEngine();
    expect(() => engine.check({ state: 'GA', product: 'quantum brioche', venue: 'farmers_market' })).toThrow(
      UnknownProductError,
    );
  });

  it('fails closed on a coverage gap (CA stub does not rule fermented foods)', () => {
    const { engine } = makeEngine();
    expect(() => engine.check({ state: 'CA', product: 'sauerkraut', venue: 'farmers_market' })).toThrow(
      CoverageGapError,
    );
  });

  it('pack-version pinning replays the law flip: TX pickles 2026-06 vs 2026-07', () => {
    const { engine } = makeEngine();
    const before = engine.check({ state: 'TX', product: 'dill pickles', venue: 'farmers_market', packVersion: '2026-06' });
    const after = engine.check({ state: 'TX', product: 'dill pickles', venue: 'farmers_market', packVersion: '2026-07' });
    expect(before.status).toBe('prohibited');
    expect(after.status).toBe('eligible');
    expect(after.conditions).toHaveLength(1);
    expect(after.conditions[0]).toMatch(/pH/);
    expect(before.snapshotHashes).not.toEqual(after.snapshotHashes);
  });

  it('defaults to the LATEST registered pack version', () => {
    const { engine } = makeEngine();
    const v = engine.check({ state: 'TX', product: 'dill pickles', venue: 'farmers_market' });
    expect(v.packVersion).toBe('2026-07');
    expect(v.status).toBe('eligible');
  });

  it('stub verdicts declare their coverage honestly', () => {
    const { engine } = makeEngine();
    const v = engine.check({ state: 'CA', product: 'chocolate chip cookies', venue: 'farmers_market' });
    expect(v.packDepth).toBe('stub');
    const coverage = v.reasons.find((r) => r.kind === 'coverage');
    expect(coverage?.message).toMatch(/stub-depth/);
  });

  it('TX carries the $50k cap as a reason + verdict field', () => {
    const { engine } = makeEngine();
    const v = engine.check({ state: 'TX', product: 'sourdough', venue: 'farmers_market' });
    expect(v.annualRevenueCapUsd).toBe(50_000);
    expect(v.reasons.some((r) => r.kind === 'cap')).toBe(true);
  });
});

describe('RuleEngine.labelRequirements / feesFor', () => {
  it('GA label spec mandates the exact fixture disclosure and net weight', () => {
    const { engine, snaps } = makeEngine();
    const spec = engine.labelRequirements('GA');
    expect(spec.mandatedSentences.map((m) => m.text)).toEqual([GA_MANDATED_SENTENCE]);
    expect(spec.requiredFields).toContain('net_weight');
    expect(spec.snapshotHashes).toEqual([snaps.ga.contentSha256]);
  });

  it('TX label spec changes wording across pack versions (the re-issue driver)', () => {
    const { engine } = makeEngine();
    expect(engine.labelRequirements('TX', '2026-06').mandatedSentences[0]!.text).toBe(TX_STATEMENT_BEFORE);
    expect(engine.labelRequirements('TX', '2026-07').mandatedSentences[0]!.text).toBe(TX_STATEMENT_AFTER);
    expect(engine.labelRequirements('TX').requiredFields).not.toContain('net_weight');
  });

  it('feesFor exposes cited fee items with estimate flags', () => {
    const { engine } = makeEngine();
    const ga = engine.feesFor('GA');
    expect(ga.items.map((f) => f.id).sort()).toEqual(['ga-cfl', 'ga-lab', 'ga-mfl']);
    expect(ga.items.find((f) => f.id === 'ga-lab')?.estimate).toBe(true);
    expect(ga.annualRevenueCapUsd).toBeNull();
    const tx = engine.feesFor('TX');
    expect(tx.annualRevenueCapUsd).toBe(50_000);
    expect(tx.items[0]!.estimate).toBe(true);
  });

  it('refuses duplicate pack registration and unknown pinned versions', () => {
    const { engine, snaps } = makeEngine();
    expect(() => engine.register(buildGaPack(snaps.ga))).toThrow(/already registered/);
    expect(() => engine.check({ state: 'GA', product: 'sourdough', venue: 'farmers_market', packVersion: '1999-01' })).toThrow(
      /not registered/,
    );
  });
});
