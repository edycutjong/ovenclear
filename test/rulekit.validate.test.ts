import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../src/core/snapshots/store';
import { validatePackGrounding, validateRulepack } from '../src/core/rulekit/validate';
import { RulepackValidationError, type Rulepack } from '../src/core/rulekit/types';
import { registerFixtureSnapshots } from '../src/fixtures/snapshots';
import { buildGaPack } from '../src/fixtures/rulepacks/ga';
import { buildTxPack } from '../src/fixtures/rulepacks/tx';
import { buildCaStubPack, buildFlStubPack } from '../src/fixtures/rulepacks/stubs';

function fixtures() {
  const store = new SnapshotStore();
  const snaps = registerFixtureSnapshots(store);
  return { store, snaps };
}

function clone(pack: Rulepack): Rulepack {
  return JSON.parse(JSON.stringify(pack)) as Rulepack;
}

describe('rulepack schema validation', () => {
  it('accepts the GA deep pack', () => {
    const { snaps } = fixtures();
    expect(() => validateRulepack(buildGaPack(snaps.ga))).not.toThrow();
  });

  it('accepts both TX pack versions', () => {
    const { snaps } = fixtures();
    expect(() => validateRulepack(buildTxPack(snaps.txBefore, '2026-06'))).not.toThrow();
    expect(() => validateRulepack(buildTxPack(snaps.txAfter, '2026-07'))).not.toThrow();
  });

  it('accepts the CA and FL stubs (schema-valid stubs are a hard requirement)', () => {
    const { snaps } = fixtures();
    expect(() => validateRulepack(buildCaStubPack(snaps.ca))).not.toThrow();
    expect(() => validateRulepack(buildFlStubPack(snaps.fl))).not.toThrow();
  });

  it('rejects a pack with no pinned snapshots (invariant I1 at the data layer)', () => {
    const { snaps } = fixtures();
    const pack = clone(buildGaPack(snaps.ga));
    pack.sourceSnapshots = [];
    expect(() => validateRulepack(pack)).toThrow(/invariant I1/);
  });

  it('rejects a citation pointing at a snapshot the pack does not pin', () => {
    const { snaps } = fixtures();
    const pack = clone(buildGaPack(snaps.ga));
    pack.citations[0]!.snapshotId = 'not-pinned';
    expect(() => validateRulepack(pack)).toThrow(/not in sourceSnapshots/);
  });

  it('rejects an incomplete venue map (every venue must be explicit)', () => {
    const { snaps } = fixtures();
    const pack = clone(buildGaPack(snaps.ga));
    delete (pack.program.venues as Record<string, unknown>).wholesale;
    expect(() => validateRulepack(pack)).toThrow(/venues.wholesale missing/);
  });

  it('rejects two rules for the same product category (ambiguity)', () => {
    const { snaps } = fixtures();
    const pack = clone(buildGaPack(snaps.ga));
    pack.productRules.push({ ...pack.productRules[0]!, id: 'dup-rule' });
    expect(() => validateRulepack(pack)).toThrow(/ruled twice/);
  });

  it('rejects unknown product categories and duplicate citation ids', () => {
    const { snaps } = fixtures();
    const bad = clone(buildGaPack(snaps.ga));
    (bad.productRules[0] as { category: string }).category = 'street_food';
    expect(() => validateRulepack(bad)).toThrow(/unknown category/);

    const dup = clone(buildGaPack(snaps.ga));
    dup.citations.push({ ...dup.citations[0]! });
    expect(() => validateRulepack(dup)).toThrow(/duplicate citation id/);
  });

  it('collects multiple problems into one RulepackValidationError', () => {
    const { snaps } = fixtures();
    const pack = clone(buildGaPack(snaps.ga));
    pack.sourceSnapshots = [];
    (pack as { stateName: string }).stateName = '';
    try {
      validateRulepack(pack);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RulepackValidationError);
      expect((e as RulepackValidationError).problems.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('rulepack grounding validation (quotes vs pinned snapshots)', () => {
  it('GA, TX (both versions) and stubs are fully grounded', () => {
    const { store, snaps } = fixtures();
    expect(() => validatePackGrounding(buildGaPack(snaps.ga), store)).not.toThrow();
    expect(() => validatePackGrounding(buildTxPack(snaps.txBefore, '2026-06'), store)).not.toThrow();
    expect(() => validatePackGrounding(buildTxPack(snaps.txAfter, '2026-07'), store)).not.toThrow();
    expect(() => validatePackGrounding(buildCaStubPack(snaps.ca), store)).not.toThrow();
    expect(() => validatePackGrounding(buildFlStubPack(snaps.fl), store)).not.toThrow();
  });

  it('detects a citation quote that is not verbatim in the snapshot', () => {
    const { store, snaps } = fixtures();
    const pack = clone(buildGaPack(snaps.ga));
    pack.citations[0]!.quote = 'this sentence was never in the law';
    expect(() => validatePackGrounding(pack, store)).toThrow(/quote not found verbatim/);
  });

  it('detects snapshot hash drift (pack pin vs store content)', () => {
    const { store, snaps } = fixtures();
    const pack = clone(buildGaPack(snaps.ga));
    pack.sourceSnapshots[0]!.contentSha256 = 'a'.repeat(64);
    expect(() => validatePackGrounding(pack, store)).toThrow(/hash mismatch/);
  });

  it('detects a mandated label sentence that drifted from the law text', () => {
    const { store, snaps } = fixtures();
    const pack = clone(buildGaPack(snaps.ga));
    pack.labelSpec.mandatedSentences[0]!.text = 'MADE IN A COTTAGE FOOD OPERATION.'; // shortened — not verbatim
    expect(() => validatePackGrounding(pack, store)).toThrow(/mandated sentence .* not found verbatim/);
  });

  it('detects a pinned snapshot that is missing from the store', () => {
    const { snaps } = fixtures();
    const emptyStore = new SnapshotStore();
    const pack = buildGaPack(snaps.ga);
    expect(() => validatePackGrounding(pack, emptyStore)).toThrow(/not in store/);
  });
});
