/**
 * scripts/seed.ts — materialize the deterministic OvenClear fixture world, and
 * with `--check` re-hash the whole thing and exit non-zero on ANY drift
 * (COMPLEXITY.md §5 "scripts/seed.py: deterministic fixtures"; SEED_DATA.md).
 *
 * What it materializes (all FIXTURE / synthetic):
 *   - the three named demo paths: rosas_bakes (GA sourdough → win), cheesecake_charlie
 *     (prohibited → the refusal), jam_june (acidified → license + lab-test path)
 *   - the 14-member TX cohort holding labels under TX@2026-06
 *   - the scripted TX historical amendment: diff pair → materiality → impact →
 *     autonomous re-issue fan-out, everything on the signed ledger
 *
 * Determinism: FixtureClock (fixed start, +1s/step) + a deterministic Ed25519
 * keyring make every hash, signature, label and ledger row byte-stable across
 * runs. `--check` proves it three ways:
 *   1. build the world twice → identical manifest hash (no nondeterminism)
 *   2. round-trip snapshots + ledger through JSONL → re-hash / re-verify clean
 *   3. compare the manifest hash to the committed golden baseline (fixture drift)
 *
 * Usage:
 *   tsx scripts/seed.ts            # materialize + (re)write the golden baseline
 *   tsx scripts/seed.ts --check    # re-hash only; exit 1 on drift
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWorld,
  runTxAmendmentReplay,
  type TxReplayResult,
  type World,
} from '../src/fixtures/world';
import { DeterministicMockAdapter } from '../src/core/lawwatch/adapter';
import { diffSnapshots } from '../src/core/rulekit/diff';
import { SnapshotStore } from '../src/core/snapshots/store';
import { verifyChain } from '../src/core/ledger/verify';
import { canonicalHash } from '../src/core/util/canonical';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD_ROOT = join(HERE, '..');
const OUT_DIR = join(BUILD_ROOT, 'data', 'seed'); // gitignored regenerable dumps
const BASELINE = join(HERE, 'seed.baseline.json'); // committed golden hash
const NAMED = ['rosas_bakes', 'cheesecake_charlie', 'jam_june'] as const;

interface SnapMeta {
  id: string;
  state: string;
  fetchedAt: string;
  byteLength: number;
  contentSha256: string;
}
interface NamedVerdictMeta {
  status: string;
  verdictHash: string;
  label: { qrId: string; labelId: string; sha256: string } | null;
}
interface ReissuedMeta {
  qrId: string;
  oldLabelId: string;
  newLabelId: string;
  newSha256: string;
}
interface Manifest {
  fixture: true;
  snapshots: SnapMeta[];
  namedCustomers: Record<string, NamedVerdictMeta>;
  txDiff: { fromHash: string; toHash: string; deltaCount: number; deltaIds: string[] };
  replay: {
    reissued: number;
    notified: number;
    noneAffectedLogged: number;
    reissuedLabels: ReissuedMeta[];
  };
  ledger: { size: number; lastHash: string; dailyRoots: { date: string; count: number; root: string }[] };
}

function namedVerdictMeta(world: World, id: string): NamedVerdictMeta {
  const c = world.customers.find((x) => x.id === id);
  if (!c || !c.verdict) throw new Error(`seed: named customer "${id}" or its verdict is missing`);
  return {
    status: c.verdict.status,
    verdictHash: c.verdict.verdictHash,
    label: c.label ? { qrId: c.label.qrId, labelId: c.label.labelId, sha256: c.label.sha256 } : null,
  };
}

function buildManifest(world: World, replay: TxReplayResult): Manifest {
  const chain = verifyChain(world.ledger.all());
  const namedCustomers: Record<string, NamedVerdictMeta> = {};
  for (const id of NAMED) namedCustomers[id] = namedVerdictMeta(world, id);

  const deltas = diffSnapshots(world.snapshots.txBefore, world.snapshots.txAfter);
  const reissuedLabels: ReissuedMeta[] = replay.execution.reissued
    .map((a) => ({
      qrId: a.qrId,
      oldLabelId: a.provenance.reissueOf ?? '',
      newLabelId: a.labelId,
      newSha256: a.sha256,
    }))
    .sort((x, y) => x.qrId.localeCompare(y.qrId));

  return {
    fixture: true,
    snapshots: world.store.list().map((s) => ({
      id: s.id,
      state: s.state,
      fetchedAt: s.fetchedAt,
      byteLength: s.byteLength,
      contentSha256: s.contentSha256,
    })),
    namedCustomers,
    txDiff: {
      fromHash: world.snapshots.txBefore.contentSha256,
      toHash: world.snapshots.txAfter.contentSha256,
      deltaCount: deltas.length,
      deltaIds: deltas.map((d) => d.id).sort(),
    },
    replay: {
      reissued: replay.execution.reissued.length,
      notified: replay.execution.notified,
      noneAffectedLogged: replay.execution.noneAffectedLogged,
      reissuedLabels,
    },
    ledger: {
      size: world.ledger.size,
      lastHash: chain.lastHash,
      dailyRoots: chain.dailyRoots.map((r) => ({ date: r.date, count: r.count, root: r.root })),
    },
  };
}

async function materialize(): Promise<{
  world: World;
  replay: TxReplayResult;
  manifest: Manifest;
  manifestHash: string;
}> {
  const world = buildWorld(); // default FixtureClock + deterministic keyring
  const replay = await runTxAmendmentReplay(world, new DeterministicMockAdapter());
  const manifest = buildManifest(world, replay);
  return { world, replay, manifest, manifestHash: canonicalHash(manifest) };
}

function rel(p: string): string {
  return relative(process.cwd(), p) || p;
}

async function runSeed(): Promise<void> {
  const { world, manifest, manifestHash } = await materialize();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'snapshots.jsonl'), world.store.toJsonl() + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, 'ledger.jsonl'), world.ledger.toJsonl() + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  writeFileSync(
    BASELINE,
    JSON.stringify(
      { note: 'GOLDEN — regenerate with `npm run seed` after any intentional fixture change', manifestHash, manifest },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log('OvenClear seed — deterministic fixture world materialized');
  console.log(`  snapshots         ${manifest.snapshots.length} (${manifest.snapshots.map((s) => s.state).join(', ')})`);
  for (const id of NAMED) {
    const n = manifest.namedCustomers[id]!;
    console.log(`  ${id.padEnd(18)}${n.status}${n.label ? ` · label ${n.label.labelId}` : ' · (no label)'}`);
  }
  console.log(`  TX amendment      ${manifest.txDiff.deltaCount} deltas → ${manifest.replay.reissued} re-issued, ${manifest.replay.notified} notified, ${manifest.replay.noneAffectedLogged} none-affected`);
  console.log(`  ledger            ${manifest.ledger.size} rows · lastHash ${manifest.ledger.lastHash.slice(0, 16)}…`);
  console.log(`  manifestHash      ${manifestHash}`);
  console.log(`  wrote             ${rel(join(OUT_DIR, 'snapshots.jsonl'))}, ledger.jsonl, manifest.json`);
  console.log(`  baseline          ${rel(BASELINE)} (commit this)`);
}

async function runCheck(): Promise<void> {
  const failures: string[] = [];

  // 1. Determinism: two independent builds must produce the identical manifest.
  const a = await materialize();
  const b = await materialize();
  if (a.manifestHash !== b.manifestHash) {
    failures.push(`nondeterministic build: ${a.manifestHash} vs ${b.manifestHash}`);
  }

  // 2. Round-trip integrity: snapshots re-hash and the ledger chain re-verifies.
  try {
    SnapshotStore.fromJsonl(a.world.store.toJsonl()); // throws on any re-hash drift
  } catch (e) {
    failures.push(`snapshot round-trip failed: ${(e as Error).message}`);
  }
  const chain = verifyChain(a.world.ledger.toJsonl());
  if (!chain.ok) {
    failures.push(`ledger chain invalid: first bad seq ${chain.firstBadSeq} (${chain.problems[0]?.reason ?? '?'})`);
  }

  // 3. Golden baseline: fixture drift guard.
  if (!existsSync(BASELINE)) {
    failures.push(`missing baseline ${rel(BASELINE)} — run \`npm run seed\` and commit it`);
  } else {
    const golden = JSON.parse(readFileSync(BASELINE, 'utf8')) as { manifestHash: string; manifest: Manifest };
    if (golden.manifestHash !== a.manifestHash) {
      failures.push(`manifest drift vs baseline: baseline ${golden.manifestHash.slice(0, 16)}… now ${a.manifestHash.slice(0, 16)}…`);
      for (const key of Object.keys(a.manifest) as (keyof Manifest)[]) {
        if (canonicalHash(a.manifest[key]) !== canonicalHash(golden.manifest[key])) {
          failures.push(`  drift in section "${key}"`);
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('seed --check: DRIFT DETECTED');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('seed --check: OK');
  console.log(`  determinism   two builds → ${a.manifestHash.slice(0, 16)}… (identical)`);
  console.log(`  round-trip    ${a.world.store.size} snapshots re-hashed · ${chain.signaturesChecked} signatures verified`);
  console.log(`  baseline      matches ${rel(BASELINE)}`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--check')) await runCheck();
  else await runSeed();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
