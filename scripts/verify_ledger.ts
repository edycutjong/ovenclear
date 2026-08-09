/**
 * scripts/verify_ledger.ts — recompute the hash chain, per-row Ed25519
 * signatures, and daily Merkle roots from a ledger JSONL export and exit
 * non-zero on ANY mutation (COMPLEXITY.md §2/§4, invariant I4).
 *
 * The verifier is the whole point of the evidence plane: a downloaded ledger
 * export is only trustworthy because anyone can re-derive it from scratch.
 *
 * Usage:
 *   tsx scripts/verify_ledger.ts <ledger.jsonl>   # verify a specific export
 *   tsx scripts/verify_ledger.ts                  # self-contained demo:
 *       materialize the fixture world + TX replay, verify the export clean,
 *       then flip one byte and prove the tamper is localized and rejected.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld, runTxAmendmentReplay } from '../src/fixtures/world';
import { DeterministicMockAdapter } from '../src/core/lawwatch/adapter';
import { DecisionLedger, type LedgerEntry } from '../src/core/ledger/ledger';
import { verifyChain, type ChainReport } from '../src/core/ledger/verify';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'data', 'seed');

function rel(p: string): string {
  return relative(process.cwd(), p) || p;
}

function printReport(report: ChainReport): void {
  console.log(`  chain ok            ${report.ok}`);
  console.log(`  rows                ${report.length}`);
  console.log(`  signatures checked  ${report.signaturesChecked}`);
  console.log(`  agents              ${report.agents.join(', ')}`);
  for (const r of report.dailyRoots) {
    console.log(`  merkle root ${r.date}  ${r.root.slice(0, 24)}… (${r.count} rows)`);
  }
  console.log(`  last hash           ${report.lastHash.slice(0, 24)}…`);
  if (report.problems.length > 0) {
    console.log(`  first bad seq       ${report.firstBadSeq}`);
    for (const p of report.problems) console.log(`    ✗ seq ${p.seq}: ${p.reason}`);
  }
}

async function materializeLedgerJsonl(): Promise<string> {
  const world = buildWorld();
  await runTxAmendmentReplay(world, new DeterministicMockAdapter());
  return world.ledger.toJsonl();
}

/** Flip one byte deep in a middle row's payload, keeping the stored hash. */
function tamperOneRow(jsonl: string): { tampered: string; victimSeq: number } {
  const entries = DecisionLedger.parseJsonl(jsonl);
  if (entries.length === 0) throw new Error('cannot tamper an empty ledger');
  const victimSeq = Math.floor(entries.length / 2);
  const victim = entries[victimSeq]!;
  const mutated: LedgerEntry = {
    ...victim,
    payload: { ...(victim.payload as Record<string, unknown>), __tamper: 'evidence-plane-demo' },
  };
  const copy = [...entries];
  copy[victimSeq] = mutated;
  return { tampered: copy.map((e) => JSON.stringify(e)).join('\n'), victimSeq };
}

function verifyFile(path: string): void {
  if (!existsSync(path)) {
    console.error(`verify_ledger: no such file "${path}"`);
    process.exit(1);
  }
  console.log(`Verifying ${rel(path)}`);
  const report = verifyChain(readFileSync(path, 'utf8'));
  printReport(report);
  if (!report.ok) {
    console.error('verify_ledger: REJECTED — the export has been mutated.');
    process.exit(1);
  }
  console.log('verify_ledger: OK — export re-derives exactly.');
}

async function selfDemo(): Promise<void> {
  console.log('verify_ledger self-demo (offline) — recompute chain + signatures + Merkle roots\n');
  const clean = await materializeLedgerJsonl();
  mkdirSync(OUT_DIR, { recursive: true });
  const cleanPath = join(OUT_DIR, 'ledger.jsonl');
  writeFileSync(cleanPath, clean + '\n', 'utf8');

  console.log(`[1/2] clean export (${rel(cleanPath)}):`);
  const cleanReport = verifyChain(clean);
  printReport(cleanReport);

  const { tampered, victimSeq } = tamperOneRow(clean);
  console.log(`\n[2/2] tampered export (one byte injected into seq ${victimSeq}'s payload):`);
  const tamperReport = verifyChain(tampered);
  printReport(tamperReport);

  const tamperCaught = !tamperReport.ok && tamperReport.firstBadSeq === victimSeq;
  console.log('');
  if (!cleanReport.ok) {
    console.error('verify_ledger: FAIL — the clean export did not verify.');
    process.exit(1);
  }
  if (!tamperCaught) {
    console.error('verify_ledger: FAIL — a mutation was NOT caught (chain check is broken).');
    process.exit(1);
  }
  console.log(`verify_ledger: PASS — clean export verifies; mutation localized + rejected at seq ${victimSeq}.`);
}

async function main(): Promise<void> {
  const fileArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (fileArg) verifyFile(fileArg);
  else await selfDemo();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
