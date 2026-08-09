import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../src/core/snapshots/store';
import { RuleEngine } from '../src/core/rulekit/engine';
import { registerFixtureSnapshots, GA_MANDATED_SENTENCE, TX_STATEMENT_BEFORE } from '../src/fixtures/snapshots';
import { buildGaPack } from '../src/fixtures/rulepacks/ga';
import { buildTxPack } from '../src/fixtures/rulepacks/tx';
import {
  allergenLine,
  composeLabel,
  deriveAllergens,
  LabelComposeError,
  type LabelArtifact,
} from '../src/core/label/compose';
import { issueLabel, LabelQaError, qaLabel } from '../src/core/label/qa';
import { LabelRegistry } from '../src/core/label/registry';

function setup() {
  const store = new SnapshotStore();
  const snaps = registerFixtureSnapshots(store);
  const engine = new RuleEngine(store);
  engine.register(buildGaPack(snaps.ga));
  engine.register(buildTxPack(snaps.txBefore, '2026-06'));
  engine.register(buildTxPack(snaps.txAfter, '2026-07'));
  const gaSpec = engine.labelRequirements('GA');
  const gaVerdict = engine.check({ state: 'GA', product: 'sourdough', venue: 'farmers_market', issuedAt: '2026-07-04T00:00:00.000Z' });
  return { engine, gaSpec, gaVerdict };
}

const rosaInput = (spec: ReturnType<typeof setup>['gaSpec'], verdict: ReturnType<typeof setup>['gaVerdict']) => ({
  qrId: 'qr_test00000001',
  businessName: "Rosa's Bakes",
  addressLine: 'Marietta, GA',
  productName: 'sourdough bread',
  ingredients: ['wheat flour', 'water', 'sea salt'],
  netWeight: '1 lb 8 oz (680 g)',
  spec,
  verdict,
  issuedAt: '2026-07-04T09:00:00.000Z',
});

describe('allergen derivation', () => {
  it('derives FDA major allergens from ingredient text (sorted)', () => {
    expect(deriveAllergens(['wheat flour', 'butter', 'eggs', 'sugar'])).toEqual(['egg', 'milk', 'wheat']);
    expect(allergenLine(['wheat flour', 'butter', 'eggs'])).toBe('CONTAINS: EGG, MILK, WHEAT');
  });

  it('respects word boundaries ("flourless mix" is not wheat; "self-rising flour" is)', () => {
    expect(deriveAllergens(['flourless cocoa blend'])).toEqual([]);
    expect(deriveAllergens(['self-rising flour'])).toEqual(['wheat']);
  });

  it('returns null line when no major allergens are present', () => {
    expect(allergenLine(['strawberries', 'sugar', 'pectin'])).toBeNull();
  });
});

describe('composeLabel — deterministic artifact', () => {
  it('same input → byte-identical artifact (labelId, text, sha256)', () => {
    const { gaSpec, gaVerdict } = setup();
    const a = composeLabel(rosaInput(gaSpec, gaVerdict));
    const b = composeLabel(rosaInput(gaSpec, gaVerdict));
    expect(a.text).toBe(b.text);
    expect(a.sha256).toBe(b.sha256);
    expect(a.labelId).toBe(b.labelId);
  });

  it('includes every mandated sentence VERBATIM plus fixture marker and QR url', () => {
    const { gaSpec, gaVerdict } = setup();
    const art = composeLabel(rosaInput(gaSpec, gaVerdict));
    expect(art.text).toContain(GA_MANDATED_SENTENCE);
    expect(art.text).toContain('[FIXTURE LABEL — synthetic demo data, not legal advice]');
    expect(art.text).toContain('Verify: https://ovenclear.example/label/qr_test00000001');
    expect(art.text).toContain('CONTAINS: WHEAT');
  });

  it('carries provenance: spec snapshot hashes + verdict hash + issue metadata', () => {
    const { gaSpec, gaVerdict } = setup();
    const art = composeLabel(rosaInput(gaSpec, gaVerdict));
    expect(art.snapshotHashes).toEqual(gaSpec.snapshotHashes);
    expect(art.provenance.verdictHash).toBe(gaVerdict.verdictHash);
    expect(art.provenance.reissueOf).toBeNull();
    expect(art.provenance.fixture).toBe(true);
  });

  it('enforces required inputs per spec (GA requires net weight; TX does not)', () => {
    const { engine, gaSpec, gaVerdict } = setup();
    const { netWeight: _dropped, ...withoutWeight } = rosaInput(gaSpec, gaVerdict);
    expect(() => composeLabel(withoutWeight)).toThrow(LabelComposeError);

    const txVerdict = engine.check({ state: 'TX', product: 'pralines', venue: 'farmers_market', packVersion: '2026-06', issuedAt: '2026-07-04T00:00:00.000Z' });
    const txSpec = engine.labelRequirements('TX', '2026-06');
    const txArt = composeLabel({
      qrId: 'qr_test00000002',
      businessName: "Pete's Pralines",
      addressLine: 'San Antonio, TX',
      productName: 'pralines',
      ingredients: ['pecans', 'sugar', 'butter'],
      spec: txSpec,
      verdict: txVerdict,
      issuedAt: '2026-07-04T09:00:00.000Z',
    });
    expect(txArt.text).toContain(TX_STATEMENT_BEFORE);
    expect(txArt.fields.netWeight).toBeNull();
  });

  it('refuses to compose for a prohibited verdict (fails closed)', () => {
    const { engine, gaSpec } = setup();
    const bad = engine.check({ state: 'GA', product: 'cheesecake', venue: 'farmers_market', issuedAt: '2026-07-04T00:00:00.000Z' });
    expect(() => composeLabel({ ...rosaInput(gaSpec, bad), verdict: bad })).toThrow(/prohibited/);
  });

  it('refuses a verdict/spec state mismatch', () => {
    const { engine, gaVerdict } = setup();
    const txSpec = engine.labelRequirements('TX', '2026-06');
    expect(() => composeLabel({ ...rosaInput(txSpec, gaVerdict) })).toThrow(/does not match spec state/);
  });
});

describe('Label-QA gate — invariant I2 (byte-verbatim, fails closed)', () => {
  function tamper(art: LabelArtifact, mutate: (text: string) => string): LabelArtifact {
    const text = mutate(art.text);
    return { ...art, text, lines: text.split('\n') };
  }

  it('passes a clean artifact and reports the checked sentence ids', () => {
    const { gaSpec, gaVerdict } = setup();
    const { artifact, qa } = issueLabel(rosaInput(gaSpec, gaVerdict));
    expect(qa.pass).toBe(true);
    expect(qa.failures).toEqual([]);
    expect(qa.checkedSentenceIds).toEqual(['ga-disclosure']);
    expect(artifact.sha256).toBe(qa.labelSha256);
  });

  it('fails when the mandated sentence is missing (and the hash no longer matches)', () => {
    const { gaSpec, gaVerdict } = setup();
    const art = composeLabel(rosaInput(gaSpec, gaVerdict));
    const bad = tamper(art, (t) => t.replace(GA_MANDATED_SENTENCE, ''));
    const qa = qaLabel(bad, gaSpec);
    expect(qa.pass).toBe(false);
    expect(qa.failures.map((f) => f.code)).toContain('mandated_sentence_missing');
    expect(qa.failures.map((f) => f.code)).toContain('sha256_mismatch');
  });

  it('fails on a single smart-quote substitution — byte-verbatim means bytes', () => {
    const { engine } = setup();
    const spec = engine.labelRequirements('TX', '2026-06');
    const verdict = engine.check({ state: 'TX', product: 'sourdough', venue: 'farmers_market', packVersion: '2026-06', issuedAt: '2026-07-04T00:00:00.000Z' });
    const art = composeLabel({
      qrId: 'qr_test00000003',
      businessName: 'Hill Country Hearth',
      addressLine: 'Fredericksburg, TX',
      productName: 'sourdough bread',
      ingredients: ['wheat flour', 'water', 'salt'],
      spec,
      verdict,
      issuedAt: '2026-07-04T09:00:00.000Z',
    });
    const bad = tamper(art, (t) => t.replace(TX_STATEMENT_BEFORE, TX_STATEMENT_BEFORE.replace('is not inspected', 'is not  inspected')));
    const qa = qaLabel(bad, spec);
    expect(qa.pass).toBe(false);
    expect(qa.failures.map((f) => f.code)).toContain('mandated_sentence_missing');
  });

  it('an OLD label fails QA against the NEW amended spec — the re-issue driver', () => {
    const { engine } = setup();
    const specOld = engine.labelRequirements('TX', '2026-06');
    const specNew = engine.labelRequirements('TX', '2026-07');
    const verdict = engine.check({ state: 'TX', product: 'fudge', venue: 'farmers_market', packVersion: '2026-06', issuedAt: '2026-07-04T00:00:00.000Z' });
    const oldLabel = composeLabel({
      qrId: 'qr_test00000004',
      businessName: "Fiona's Fudge",
      addressLine: 'Waco, TX',
      productName: 'fudge',
      ingredients: ['sugar', 'butter', 'cocoa'],
      spec: specOld,
      verdict,
      issuedAt: '2026-07-04T09:00:00.000Z',
    });
    const qa = qaLabel(oldLabel, specNew);
    expect(qa.pass).toBe(false);
    expect(qa.failures.map((f) => f.code)).toContain('mandated_sentence_missing'); // new wording absent
    expect(qa.failures.map((f) => f.code)).toContain('snapshot_hashes_mismatch'); // pinned to old law
  });

  it('fails when the allergen line disagrees with the ingredients', () => {
    const { gaSpec, gaVerdict } = setup();
    const art = composeLabel(rosaInput(gaSpec, gaVerdict));
    const bad = tamper(art, (t) => t.replace('CONTAINS: WHEAT', 'CONTAINS: SUNSHINE'));
    const withBadField = { ...bad, fields: { ...bad.fields, allergenLine: 'CONTAINS: SUNSHINE' } };
    const qa = qaLabel(withBadField, gaSpec);
    expect(qa.pass).toBe(false);
    expect(qa.failures.map((f) => f.code)).toContain('allergen_line_wrong');
  });

  it('fails when snapshot hashes are stripped (I1 carried into the artifact)', () => {
    const { gaSpec, gaVerdict } = setup();
    const art = composeLabel(rosaInput(gaSpec, gaVerdict));
    const qa = qaLabel({ ...art, snapshotHashes: [] }, gaSpec);
    expect(qa.pass).toBe(false);
    expect(qa.failures.map((f) => f.code)).toContain('snapshot_hashes_empty');
  });

  it('LabelQaError carries the QA result (the fail-closed exception surface)', () => {
    const { gaSpec, gaVerdict } = setup();
    const art = composeLabel(rosaInput(gaSpec, gaVerdict));
    const bad = { ...art, text: art.text.replace(GA_MANDATED_SENTENCE, ''), lines: [] };
    const qa = qaLabel(bad, gaSpec);
    const err = new LabelQaError(qa);
    expect(err.name).toBe('LabelQaError');
    expect(err.message).toMatch(/fails closed/);
    expect(err.result.pass).toBe(false);
  });
});

describe('LabelRegistry — stable qrId + issue history', () => {
  it('creates deterministic qrIds and is idempotent per order', () => {
    const reg = new LabelRegistry();
    const a = reg.create('ord_1', 'cust_1', 'GA');
    const b = reg.create('ord_1', 'cust_1', 'GA');
    expect(a).toBe(b);
    expect(a.qrId).toBe(LabelRegistry.qrIdFor('ord_1', 'GA'));
    expect(a.qrId).toMatch(/^qr_[0-9a-f]{12}$/);
  });

  it('chains re-issues through reissueOf and rejects broken chains', () => {
    const { gaSpec, gaVerdict } = setup();
    const reg = new LabelRegistry();
    const entry = reg.create('ord_1', 'cust_1', 'GA');
    const first = composeLabel({ ...rosaInput(gaSpec, gaVerdict), qrId: entry.qrId });
    reg.appendIssue(entry.qrId, first);

    const reissue = composeLabel({
      ...rosaInput(gaSpec, gaVerdict),
      qrId: entry.qrId,
      issuedAt: '2026-07-05T09:00:00.000Z',
      reissueOf: first.labelId,
      reissueReason: 'test re-issue',
    });
    reg.appendIssue(entry.qrId, reissue);
    const hist = reg.mustGet(entry.qrId).issueHistory;
    expect(hist).toHaveLength(2);
    expect(hist[1]!.reissueOf).toBe(first.labelId);

    // a second artifact claiming the FIRST label as predecessor must be rejected now
    const brokenChain = composeLabel({
      ...rosaInput(gaSpec, gaVerdict),
      qrId: entry.qrId,
      issuedAt: '2026-07-06T09:00:00.000Z',
      reissueOf: first.labelId,
      reissueReason: 'stale predecessor',
    });
    expect(() => reg.appendIssue(entry.qrId, brokenChain)).toThrow(/must chain to the previous label/);
  });

  it('rejects a first issue that claims a predecessor, and unknown qrIds', () => {
    const { gaSpec, gaVerdict } = setup();
    const reg = new LabelRegistry();
    const entry = reg.create('ord_2', 'cust_2', 'GA');
    const art = composeLabel({ ...rosaInput(gaSpec, gaVerdict), qrId: entry.qrId, reissueOf: 'lbl_ghost', reissueReason: 'x' });
    expect(() => reg.appendIssue(entry.qrId, art)).toThrow(/first issue cannot claim/);
    expect(() => reg.appendIssue('qr_missing00000', art)).toThrow(/not found/);
  });

  it('byState filters registry entries', () => {
    const reg = new LabelRegistry();
    reg.create('ord_ga', 'c1', 'GA');
    reg.create('ord_tx', 'c2', 'TX');
    expect(reg.byState('TX')).toHaveLength(1);
    expect(reg.all()).toHaveLength(2);
  });
});
