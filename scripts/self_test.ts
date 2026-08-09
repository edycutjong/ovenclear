/**
 * scripts/self_test.ts — offline end-to-end proof of the ONE OvenClear flow
 * (PRD "question in → verdict + compliant label out, and kept compliant").
 * No network, no API key: the materiality classifier is the DeterministicMock.
 *
 *   Section 1  interview → verdict → label + QA gate           (rosas_bakes win path)
 *              + the refusal (cheesecake_charlie, prohibited)
 *              + the licensing edge (jam_june, acidified)
 *   Section 2  TX historical amendment: diff → materiality(mock) → impact →
 *              autonomous re-issue fan-out (the $5/mo Law-Watch substance)
 *   Section 3  the signed, hash-chained decision ledger (tail + full verify)
 *
 * Exits non-zero if any check fails.
 */
import { buildWorld, runTxAmendmentReplay } from '../src/fixtures/world';
import { DeterministicMockAdapter } from '../src/core/lawwatch/adapter';
import { normalizeInterview } from '../src/core/intake/interview';
import { issueLabel, qaLabel } from '../src/core/label/qa';
import { composeLabel, LabelComposeError } from '../src/core/label/compose';
import { verifyChain } from '../src/core/ledger/verify';
import { CUSTOMER_FIXTURES } from '../src/fixtures/customers';
import { writeVerifyData } from './export_verify_data';

const checks: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  checks.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
}

async function main(): Promise<void> {
  console.log('OvenClear self-test — offline (no network, no API key)\n');

  const world = buildWorld(); // interview→verdict→label+QA for every fixture customer, ledgered
  const engine = world.engine;
  const issuedAt = '2026-07-04T09:00:00.000Z';

  // ── Section 1: interview → verdict → label + QA ──────────────────────────
  console.log('Section 1 — interview → verdict → label + QA gate');
  const rosas = CUSTOMER_FIXTURES.find((c) => c.id === 'rosas_bakes');
  if (!rosas) throw new Error('fixture rosas_bakes missing');

  const normalized = normalizeInterview(
    {
      state: rosas.state,
      productDescription: rosas.product,
      venue: rosas.venue,
      businessName: rosas.businessName,
      city: rosas.city,
      ingredients: rosas.ingredients,
      contactEmail: rosas.email,
    },
    engine,
  );
  console.log(`  [interview] ${normalized.state} · "${rosas.product}" → ${normalized.canonicalProduct} (${normalized.category}) · ${normalized.venue}`);
  check(
    'interview normalizes the vocabulary gap (sourdough → baked_shelf_stable)',
    normalized.state === 'GA' && normalized.category === 'baked_shelf_stable' && normalized.venue === 'farmers_market',
  );

  const verdict = engine.check({
    state: normalized.state,
    product: normalized.productInput,
    venue: normalized.venue,
    packVersion: '2026-07',
    issuedAt,
  });
  console.log(`  [verdict]   ${verdict.status} · cites ${verdict.citations.map((c) => c.id).join(', ')} · snapshot ${verdict.snapshotHashes[0]!.slice(0, 8)}…`);
  check(
    'verdict = eligible and pins ≥1 law snapshot hash (I1)',
    verdict.status === 'eligible' && verdict.snapshotHashes.length > 0,
  );

  const spec = engine.labelRequirements('GA', '2026-07');
  const { artifact, qa } = issueLabel({
    qrId: 'qr_selftest_rosas',
    businessName: rosas.businessName,
    addressLine: rosas.city,
    productName: normalized.canonicalProduct,
    ingredients: rosas.ingredients,
    ...(rosas.netWeight ? { netWeight: rosas.netWeight } : {}),
    spec,
    verdict,
    issuedAt,
  });
  console.log(`  [label]     ${artifact.labelId} · sha256 ${artifact.sha256.slice(0, 12)}… · QA checked [${qa.checkedSentenceIds.join(', ')}]`);
  check(
    'label QA gate PASS — mandated sentence byte-verbatim (I2)',
    qa.pass && artifact.text.includes(spec.mandatedSentences[0]!.text),
  );

  // the refusal — a prohibited verdict must not yield a label (fails closed)
  const charlieVerdict = engine.check({ state: 'GA', product: 'cheesecake', venue: 'farmers_market', packVersion: '2026-07', issuedAt });
  let refusedForProhibited = false;
  try {
    composeLabel({
      qrId: 'qr_selftest_charlie',
      businessName: "Charlie's Cheesecakes",
      addressLine: 'Atlanta, GA',
      productName: 'cheesecake',
      ingredients: ['cream cheese', 'eggs', 'sugar', 'wheat flour'],
      netWeight: '2 lb',
      spec,
      verdict: charlieVerdict,
      issuedAt,
    });
  } catch (e) {
    refusedForProhibited = e instanceof LabelComposeError && /prohibited/.test(e.message);
  }
  check('the refusal — prohibited cheesecake yields NO label (cheesecake_charlie)', charlieVerdict.status === 'prohibited' && refusedForProhibited);

  // the licensing edge — acidified tomato jam routes to license + lab test
  const juneVerdict = engine.check({ state: 'GA', product: 'tomato jam', venue: 'farmers_market', packVersion: '2026-07', issuedAt });
  check(
    'the edge — acidified tomato jam → license_required + 2 conditions (jam_june)',
    juneVerdict.status === 'license_required' && juneVerdict.conditions.length === 2,
  );

  // ── Section 2: TX amendment → materiality → impact → re-issue ────────────
  console.log('\nSection 2 — TX historical amendment replay (diff → mock materiality → impact → re-issue)');
  const replay = await runTxAmendmentReplay(world, new DeterministicMockAdapter());
  const material = replay.results.filter((r) => r.classification === 'material');
  const cosmetic = replay.results.filter((r) => r.classification === 'cosmetic');
  const immaterial = replay.results.filter((r) => r.classification === 'immaterial');
  const labelImpact = replay.impacts.find((i) => i.scope === 'label_text');
  const eligImpact = replay.impacts.find((i) => i.scope === 'eligibility');

  console.log(`  [diff]      ${replay.deltas.length} deltas: ${replay.results.map((r) => `${r.classification}/${r.scope}`).join(', ')}`);
  check('TX diff → exactly 5 deltas, all "changed"', replay.deltas.length === 5 && replay.deltas.every((d) => d.kind === 'changed'));
  check('materiality — 2 material, 1 cosmetic, 2 immaterial', material.length === 2 && cosmetic.length === 1 && immaterial.length === 2);
  check('impact — label-wording change touches 14 label-holders', !!labelImpact && labelImpact.affectedCustomerIds.length === 14);
  check('impact — eligibility change affects nobody → logged (I3)', !!eligImpact && eligImpact.noneAffected === true);
  console.log(`  [reissue]   ${replay.execution.reissued.length} labels re-issued · ${replay.execution.notified} notified · ${replay.execution.noneAffectedLogged} none-affected logged`);
  check(
    're-issue fan-out — 9 subscriber labels re-issued, 5 non-subscribers notified',
    replay.execution.reissued.length === 9 && replay.execution.notified === 5 && replay.execution.noneAffectedLogged === 1,
  );

  const spec07 = engine.labelRequirements('TX', '2026-07');
  const allReQa = replay.execution.reissued.every(
    (a) => qaLabel(a, spec07).pass && a.packVersion === '2026-07' && a.text.includes('or a local health department'),
  );
  check('every re-issued label re-passes the QA gate under TX@2026-07', allReQa);

  // ── Section 3: the signed decision ledger ────────────────────────────────
  console.log('\nSection 3 — signed, hash-chained decision ledger');
  const report = verifyChain(world.ledger.all());
  check('ledger chain + every Ed25519 signature verify (I4)', report.ok);
  console.log('  ledger tail:');
  for (const e of world.ledger.tail(8)) {
    console.log(`    #${String(e.seq).padStart(2)} ${e.agent.padEnd(15)} ${e.kind}`);
  }

  // ── Summary (last 3 lines are self-contained) ────────────────────────────
  const passed = checks.filter((c) => c.ok).length;
  const ok = passed === checks.length;
  const root = report.dailyRoots[0];
  console.log('');
  console.log(`Ledger: ${report.length} rows, chain ${report.ok ? 'OK' : 'BAD'}, ${report.signaturesChecked} signatures, lastHash ${report.lastHash.slice(0, 16)}…, merkleRoot ${root ? root.root.slice(0, 12) + '…' : 'n/a'}`);
  console.log('Checks: rosas verdict+label+QA · charlie refused · june licensed · 5 deltas (2 material/1 cosmetic/2 immaterial) · 9 re-issues · 5 notices · 1 none-affected');
  console.log(`SELF-TEST: ${ok ? 'PASS' : 'FAIL'} (${passed}/${checks.length} checks)`);

  // Export the real artifacts to the committed /verify surface (dashboard data).
  // This is a side-effect only; it never changes the check tally above.
  if (ok) {
    try {
      const { dataPath } = await writeVerifyData({ quiet: true });
      console.log(`/verify data exported → ${dataPath.replace(process.cwd() + '/', '')}`);
    } catch (e) {
      console.warn(`(note) /verify export skipped: ${(e as Error).message}`);
    }
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
