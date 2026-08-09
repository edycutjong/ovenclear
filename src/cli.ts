#!/usr/bin/env -S npx tsx
/**
 * OvenClear `rulekit` CLI — a thin, offline command surface over the SAME core
 * the tests exercise. No new decision logic lives here: every subcommand wraps
 * an existing exported API (RuleEngine, label compose+QA, the law-watch loop,
 * the signed-ledger verifier) or delegates to an existing proof script.
 *
 *   rulekit check   --state GA --product sourdough --venue farmers-market
 *   rulekit label   --state GA --business "Rosa's Bakes"
 *   rulekit diff    --state TX --from 2026-06 --to 2026-07
 *   rulekit self-test
 *   rulekit verify  <ledger.jsonl>
 *   rulekit bench
 *
 * Everything runs with no network and no API key; all rule data is FIXTURE.
 * `npx tsx src/cli.ts --help` prints usage.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld, type World } from './fixtures/world';
import { diffSnapshots } from './core/rulekit/diff';
import { DeterministicMockAdapter } from './core/lawwatch/adapter';
import { resolveImpact } from './core/lawwatch/impact';
import { issueLabel } from './core/label/qa';
import { LabelComposeError } from './core/label/compose';
import { LabelQaError } from './core/label/qa';
import {
  CoverageGapError,
  UnknownProductError,
  UnsupportedStateError,
  VENUE_CODES,
  type VenueCode,
  type Verdict,
} from './core/rulekit/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..', 'scripts');

// ── tiny arg parser: `cmd [positionals] [--flag value | --flag=value | --bool] ──
interface Args {
  cmd: string;
  positionals: string[];
  opts: Record<string, string | boolean>;
}
function parse(argv: string[]): Args {
  const [cmd = '', ...rest] = argv;
  const positionals: string[] = [];
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        opts[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = rest[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          opts[body] = next;
          i++;
        } else {
          opts[body] = true;
        }
      }
    } else {
      positionals.push(a);
    }
  }
  return { cmd, positionals, opts };
}

function str(opts: Args['opts'], key: string, fallback?: string): string | undefined {
  const v = opts[key];
  if (typeof v === 'string') return v;
  return fallback;
}
function normVenue(v: string): VenueCode {
  return v.trim().toLowerCase().replace(/[\s-]+/g, '_') as VenueCode;
}

// ── formatting helpers (plain text — no ANSI, clean in terminals + screenshots) ─
const rule = '─'.repeat(64);
function head(title: string): void {
  console.log(`OvenClear · ${title}   [FIXTURE / offline — no network, no API key]`);
  console.log(rule);
}
function hashShort(h: string, n = 16): string {
  return h ? `${h.slice(0, n)}…` : '';
}

let WORLD: World | null = null;
function world(): World {
  if (!WORLD) WORLD = buildWorld({ includeAmendedTx: true });
  return WORLD;
}

function printVerdict(v: Verdict): void {
  const mark = v.status === 'eligible' ? '✓' : v.status === 'license_required' ? '‼' : '✕';
  console.log(`  ${mark} VERDICT: ${v.status.toUpperCase()}   (${v.state}@${v.packVersion}, ${v.packDepth})`);
  console.log(`    product : ${v.product.input} → ${v.product.canonical} (${v.product.category})`);
  console.log(`    venue   : ${v.venue}`);
  console.log('');
  console.log('  Reasons:');
  for (const r of v.reasons) console.log(`    · [${r.kind}] ${r.message}`);
  if (v.conditions.length) {
    console.log('  Conditions:');
    for (const c of v.conditions) console.log(`    - ${c}`);
  }
  console.log('');
  console.log('  Citations (each a verbatim quote of pinned law):');
  for (const c of v.citations) {
    console.log(`    ${c.id}  ${c.section}  [snapshot ${hashShort(c.snapshotHash, 12)}]`);
    console.log(`      “${c.quote}”`);
  }
  if (v.checklist.length) {
    console.log('');
    console.log('  Checklist:');
    for (const s of v.checklist) {
      const fee = s.feeUsd !== undefined ? `  ($${s.feeUsd})` : '';
      console.log(`    ${s.step}. ${s.text}${fee}`);
    }
  }
  console.log('');
  console.log(`  snapshot hashes : ${v.snapshotHashes.map((h) => hashShort(h, 12)).join(', ')}`);
  console.log(`  verdict hash    : ${v.verdictHash}`);
  console.log('  (I1) every verdict pins ≥1 law snapshot hash.');
}

function cmdCheck(args: Args): number {
  const state = (str(args.opts, 'state') ?? '').toUpperCase();
  const product = str(args.opts, 'product') ?? '';
  const venueRaw = str(args.opts, 'venue') ?? 'farmers_market';
  const pack = str(args.opts, 'pack');
  if (!state || !product) {
    console.error('usage: rulekit check --state GA --product sourdough --venue farmers-market [--pack 2026-07]');
    return 2;
  }
  head(`check · ${state} · "${product}"`);
  try {
    const v = world().engine.check({
      state,
      product,
      venue: normVenue(venueRaw),
      ...(pack ? { packVersion: pack } : {}),
      issuedAt: '2026-07-04T09:00:00.000Z',
    });
    printVerdict(v);
    return 0;
  } catch (e) {
    return explain(e);
  }
}

function cmdLabel(args: Args): number {
  const state = (str(args.opts, 'state') ?? '').toUpperCase();
  const business = str(args.opts, 'business');
  if (!state || !business) {
    console.error('usage: rulekit label --state GA --business "Rosa\'s Bakes" [--product sourdough --venue farmers-market --city "Marietta, GA" --ingredients "wheat flour,water,sea salt" --net-weight "1 lb"]');
    return 2;
  }
  const product = str(args.opts, 'product') ?? 'sourdough';
  const venueRaw = str(args.opts, 'venue') ?? 'farmers_market';
  const city = str(args.opts, 'city') ?? `Demo City, ${state}`;
  const ingredients = (str(args.opts, 'ingredients') ?? 'wheat flour,water,sea salt')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const netWeight = str(args.opts, 'net-weight') ?? '1 lb (454 g)';
  const pack = str(args.opts, 'pack');

  head(`label · ${state} · ${business}`);
  const eng = world().engine;
  let verdict: Verdict;
  try {
    verdict = eng.check({
      state, product, venue: normVenue(venueRaw),
      ...(pack ? { packVersion: pack } : {}),
      issuedAt: '2026-07-04T09:00:00.000Z',
    });
  } catch (e) {
    return explain(e);
  }
  if (verdict.status === 'prohibited') {
    console.log('  ✕ NO LABEL — this product is PROHIBITED (the engine fails closed).');
    console.log('    The refusal is the product working. Reasons:');
    for (const r of verdict.reasons) console.log(`      · [${r.kind}] ${r.message}`);
    return 0;
  }
  try {
    const spec = eng.labelRequirements(state, verdict.packVersion);
    const { artifact, qa } = issueLabel({
      qrId: `qr_cli_${state.toLowerCase()}`,
      businessName: business,
      addressLine: city,
      productName: verdict.product.canonical,
      ingredients,
      netWeight,
      spec,
      verdict,
      issuedAt: '2026-07-04T09:00:00.000Z',
    });
    console.log('  Compliant label (composed + QA-gated):');
    console.log('  ┌' + '─'.repeat(60));
    for (const line of artifact.lines) console.log('  │ ' + line);
    console.log('  └' + '─'.repeat(60));
    console.log('');
    console.log(`  ✓ QA: PASS — mandated sentence byte-verbatim (I2). checked [${qa.checkedSentenceIds.join(', ')}]`);
    console.log(`  label id        : ${artifact.labelId}`);
    console.log(`  label sha256    : ${artifact.sha256}`);
    console.log(`  snapshot hashes : ${artifact.snapshotHashes.map((h) => hashShort(h, 12)).join(', ')}`);
    console.log(`  provenance QR   : ${artifact.qrUrl}`);
    return 0;
  } catch (e) {
    if (e instanceof LabelQaError) {
      console.log('  ✕ QA FAILED (fails closed):');
      for (const f of e.result.failures) console.log(`      - ${f.code}: ${f.detail}`);
      return 1;
    }
    if (e instanceof LabelComposeError) {
      console.error(`  ✕ compose error: ${e.message}`);
      return 1;
    }
    return explain(e);
  }
}

async function diffReportAsync(
  w: World,
  deltas: ReturnType<typeof diffSnapshots>,
  adapter: DeterministicMockAdapter,
  from: string,
  to: string,
): Promise<number> {
  const results = await adapter.classifyMateriality({ state: 'TX', deltas });
  const material = results.filter((r) => r.classification === 'material').length;
  const cosmetic = results.filter((r) => r.classification === 'cosmetic').length;
  const immaterial = results.filter((r) => r.classification === 'immaterial').length;
  const impacts = resolveImpact({ state: 'TX', deltas, results, customers: w.customers });

  console.log(`  snapshot ${from}: ${hashShort(w.snapshots.txBefore.contentSha256, 12)}`);
  console.log(`  snapshot ${to}: ${hashShort(w.snapshots.txAfter.contentSha256, 12)}`);
  console.log(`  classifier: ${adapter.name}  (offline mock; mirrors the Gemini result schema)`);
  console.log('');
  console.log(`  ${deltas.length} deltas → ${material} material / ${cosmetic} cosmetic / ${immaterial} immaterial`);
  console.log('');
  const byId = new Map(results.map((r) => [r.deltaId, r]));
  for (const d of deltas) {
    const r = byId.get(d.id)!;
    console.log(`  ${d.section}`);
    console.log(`    ${r.classification.toUpperCase()} / ${r.scope}  — ${r.rationale}`);
    for (const line of d.excerpt.split('\n')) console.log(`      ${line}`);
    console.log('');
  }
  const labelImpact = impacts.find((i) => i.scope === 'label_text');
  const eligImpact = impacts.find((i) => i.scope === 'eligibility');
  console.log('  Impact (over the fixture TX cohort):');
  if (labelImpact) console.log(`    · label wording change touches ${labelImpact.affectedCustomerIds.length} label-holders → Law-Watch re-issues`);
  if (eligImpact) console.log(`    · eligibility change affects ${eligImpact.affectedCustomerIds.length} → ${eligImpact.noneAffected ? 'none affected, logged (I3)' : 'notify'}`);
  console.log('');
  console.log('  Run `rulekit self-test` to watch the full re-issue fan-out land on the signed ledger.');
  return 0;
}

function explain(e: unknown): number {
  if (e instanceof UnsupportedStateError) {
    console.error(`  ✕ ${e.message}`);
    console.error(`    covered states: ${world().engine.states().join(', ')}`);
    return 1;
  }
  if (e instanceof UnknownProductError) {
    console.error(`  ✕ ${e.message}`);
    return 1;
  }
  if (e instanceof CoverageGapError) {
    console.error(`  ✕ ${e.message}`);
    return 1;
  }
  console.error(`  ✕ ${(e as Error).message}`);
  return 1;
}

function delegate(script: string, extra: string[]): number {
  const r = spawnSync('npx', ['tsx', resolve(SCRIPTS, script), ...extra], { stdio: 'inherit' });
  return r.status ?? 1;
}

const HELP = `OvenClear · rulekit CLI   [FIXTURE / offline — no network, no API key]

Cottage-food compliance verdicts + auto-reissued labels, kept true as the law changes.
All rule data is FIXTURE / synthetic; nothing here is legal advice.

USAGE
  rulekit <command> [options]

COMMANDS
  check     Statute-cited "can I sell this?" verdict for a product + venue + state.
              rulekit check --state GA --product sourdough --venue farmers-market
              rulekit check --state GA --product cheesecake --venue farmers-market   # the refusal

  label     Compose a print-ready compliant label and run the byte-verbatim QA gate (I2).
              rulekit label --state GA --business "Rosa's Bakes"
              rulekit label --state GA --business "X" --product "tomato jam"

  diff      Diff two law snapshots → materiality (material/cosmetic/immaterial) + impact.
              rulekit diff --state TX --from 2026-06 --to 2026-07

  self-test End-to-end offline proof: verdict → label → refusal → TX re-issue fan-out
            → signed-ledger tail → PASS/FAIL. (delegates to scripts/self_test.ts)

  verify    Recompute a ledger export's hash chain + every Ed25519 signature + Merkle
            roots; localizes + rejects any tampered row.
              rulekit verify verify/data/ledger.jsonl
              rulekit verify                       # self-demo: clean, then tamper @ seq 39

  bench     Verdict p50/p95 over the golden set + zero-flip gate. (scripts/bench.ts)

OPTIONS (check/label)
  --state <XX>        two-letter state (GA, TX deep · CA, FL stub)
  --product <text>    free-vocabulary product ("sourdough", "tomato jam", "cheesecake")
  --venue <code>      farmers-market | home-pickup | online-instate-shipping |
                      mail-order-interstate | wholesale | event-festival
  --pack <version>    pin a pack version (default: latest registered)
  --business, --city, --ingredients "a,b,c", --net-weight   (label only)

GLOBAL
  --help, -h          this message

Venues: ${VENUE_CODES.join(', ')}
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const args = parse(argv);
  if (args.cmd === '' || args.cmd === '--help' || args.cmd === '-h' || args.opts['help'] === true) {
    console.log(HELP);
    return 0;
  }
  switch (args.cmd) {
    case 'check':
      return cmdCheck(args);
    case 'label':
      return cmdLabel(args);
    case 'diff': {
      const state = (str(args.opts, 'state') ?? '').toUpperCase();
      const from = str(args.opts, 'from') ?? '2026-06';
      const to = str(args.opts, 'to') ?? '2026-07';
      if (!state) {
        console.error('usage: rulekit diff --state TX [--from 2026-06 --to 2026-07]');
        return 2;
      }
      head(`diff · ${state} · ${from} → ${to}`);
      const w = world();
      if (state !== 'TX') {
        console.log(`  Only one law snapshot is modeled for ${state} in this build (no diff pair).`);
        console.log('  The TX fixture carries the replayed historical amendment: try `rulekit diff --state TX`.');
        return 0;
      }
      const deltas = diffSnapshots(w.snapshots.txBefore, w.snapshots.txAfter);
      return diffReportAsync(w, deltas, new DeterministicMockAdapter(), from, to);
    }
    case 'self-test':
      return delegate('self_test.ts', []);
    case 'verify':
      return delegate('verify_ledger.ts', args.positionals);
    case 'bench':
      return delegate('bench.ts', args.positionals);
    default:
      console.error(`unknown command "${args.cmd}". Run \`rulekit --help\`.`);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
