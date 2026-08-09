/**
 * scripts/bench.ts — verdict latency p50/p95 over the golden set, plus a
 * law-watch pass (diff → mock materiality classify → impact) micro-bench
 * (COMPLEXITY.md §5 "scripts/bench.py"). Fully offline: the classifier is the
 * DeterministicMockAdapter, so no network / API key is touched.
 *
 * Usage: tsx scripts/bench.ts [--iters N]   (default N = 1000 per golden case)
 */
import { buildWorld } from '../src/fixtures/world';
import { GOLDEN_CASES } from '../src/fixtures/golden';
import { diffSnapshots } from '../src/core/rulekit/diff';
import { DeterministicMockAdapter } from '../src/core/lawwatch/adapter';
import { resolveImpact } from '../src/core/lawwatch/impact';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) {
    const v = Number(process.argv[i + 1]);
    if (Number.isFinite(v) && v > 0) return Math.floor(v);
  }
  return fallback;
}

interface Stats {
  n: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

/** Percentiles over durations in nanoseconds; returned in microseconds. */
function summarize(samplesNs: number[]): Stats {
  const sorted = [...samplesNs].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (q: number): number => {
    if (n === 0) return 0;
    const idx = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1));
    return sorted[idx]! / 1000;
  };
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    n,
    p50: at(0.5),
    p90: at(0.9),
    p95: at(0.95),
    p99: at(0.99),
    min: (sorted[0] ?? 0) / 1000,
    max: (sorted[n - 1] ?? 0) / 1000,
    mean: n === 0 ? 0 : sum / n / 1000,
  };
}

function us(x: number): string {
  return `${x.toFixed(2)}µs`;
}

function printStats(label: string, s: Stats): void {
  console.log(
    `  ${label.padEnd(30)} n=${String(s.n).padStart(6)}  p50=${us(s.p50).padStart(10)}  p95=${us(s.p95).padStart(10)}  p99=${us(s.p99).padStart(10)}  max=${us(s.max).padStart(10)}`,
  );
}

async function main(): Promise<void> {
  const iters = arg('--iters', 1000);
  const world = buildWorld({ includeAmendedTx: true }); // registers TX@2026-07 for golden cases
  const engine = world.engine;

  console.log(`OvenClear bench (offline) — ${GOLDEN_CASES.length} golden cases × ${iters} iters\n`);

  // --- verdict latency over the golden set ---
  // Warm up + correctness gate: a bench that produces wrong verdicts is worthless.
  let flips = 0;
  for (const c of GOLDEN_CASES) {
    const v = engine.check({ state: c.state, product: c.product, venue: c.venue, packVersion: c.packVersion });
    if (v.status !== c.expect.status) flips++;
  }

  const verdictNs: number[] = [];
  for (const c of GOLDEN_CASES) {
    for (let i = 0; i < iters; i++) {
      const t0 = process.hrtime.bigint();
      engine.check({ state: c.state, product: c.product, venue: c.venue, packVersion: c.packVersion });
      verdictNs.push(Number(process.hrtime.bigint() - t0));
    }
  }
  printStats('verdict (rulekit.check)', summarize(verdictNs));

  // --- law-watch pass: diff → classify(mock) → impact (no ledger mutation) ---
  const adapter = new DeterministicMockAdapter();
  const lawWatchNs: number[] = [];
  const passes = Math.max(200, Math.floor(iters / 2));
  for (let i = 0; i < passes; i++) {
    const t0 = process.hrtime.bigint();
    const deltas = diffSnapshots(world.snapshots.txBefore, world.snapshots.txAfter);
    const results = await adapter.classifyMateriality({ state: 'TX', deltas });
    resolveImpact({ state: 'TX', deltas, results, customers: world.customers });
    lawWatchNs.push(Number(process.hrtime.bigint() - t0));
  }
  printStats('law-watch pass (mock diff)', summarize(lawWatchNs));

  console.log(`\n  golden verdict flips: ${flips} / ${GOLDEN_CASES.length}`);
  if (flips > 0) {
    console.error('bench: FAIL — golden verdict regression (see flips above).');
    process.exit(1);
  }
  console.log('bench: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
