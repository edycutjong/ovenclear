/**
 * scripts/capture_evidence.ts — produce ≥15 REAL live-execution screenshots
 * for the submission (docs/evidence/*.png), all @2x.
 *
 * Two kinds of evidence, every image an artifact of a real offline run:
 *   1. the /verify dashboard + panels (full page, verdict cards, the physical
 *      label, the QR provenance page, the TX diff→re-issue ledger, the Merkle
 *      badge, the live counters) — rendered from the committed verify-data.js
 *   2. "terminal" evidence — the ACTUAL stdout of the real scripts/CLI
 *      (self_test, verify_ledger, bench, rulekit check/diff/label/--help),
 *      captured live and rendered into a dark terminal frame.
 *
 * Nothing is faked: the terminal frames wrap real captured stdout, and the
 * dashboard renders the same data the ledger verifier re-derives.
 *
 * Reuses the repo screenshot pattern: deviceScaleFactor 2, document.fonts.ready,
 * try/finally close(). Chromium is cached system-wide.
 *
 * Usage:  tsx scripts/capture_evidence.ts     (npm run evidence)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { writeVerifyData } from './export_verify_data';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const VERIFY = join(ROOT, 'verify');
const OUT = join(ROOT, 'docs', 'evidence');

function rel(p: string): string {
  return relative(process.cwd(), p) || p;
}

const shots: string[] = [];
function note(name: string): void {
  shots.push(name);
  console.log(`  ✓ ${String(shots.length).padStart(2)}  ${name}`);
}

// ── run a real command, capture its live stdout+stderr ──────────────────────
function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ? (r.stdout ? '\n' : '') + r.stderr : '');
  return out.replace(/\n+$/, '');
}

// ── dark terminal frame wrapping REAL captured output ───────────────────────
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function classify(line: string): string {
  if (/^[\s─]+$/.test(line) && /─/.test(line)) return 'dim';
  if (/✕|✗|FAIL|REJECTED|PROHIBITED|NOT ALLOWED|DRIFT|invalid|no such/i.test(line)) return 'red';
  if (/✓|✔|\bPASS\b|\bOK\b|ELIGIBLE|CLEARED|\bsigned\b|re-derives|verifies exactly|bench: OK|chain OK|localized \+ rejected|QA: PASS/i.test(line)) return 'green';
  if (/‼|\bMATERIAL\b|license_required|LAW-WATCH|Merkle|merkle root|re-issued/i.test(line)) return 'amber';
  if (/^OvenClear ·/.test(line)) return 'head';
  return '';
}
function terminalHtml(title: string, command: string, output: string): string {
  const body = output
    .split('\n')
    .map((l) => `<span class="${classify(l)}">${esc(l) || '&nbsp;'}</span>`)
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    :root{--mono:'JetBrains Mono','SF Mono',ui-monospace,Menlo,Consolas,monospace}
    *{box-sizing:border-box} html,body{margin:0;background:#0b0705}
    .term{width:960px;margin:22px auto;border:1px solid #3B2A20;border-radius:12px;overflow:hidden;
      box-shadow:0 26px 60px -28px rgba(0,0,0,.9);background:linear-gradient(180deg,#170F0B,#0E0806)}
    .bar{display:flex;align-items:center;gap:10px;padding:11px 14px;background:#211610;border-bottom:1px solid #3B2A20}
    .dot{width:11px;height:11px;border-radius:50%}
    .r{background:#E85B41}.y{background:#F5B841}.g{background:#5FBE82}
    .cmd{margin-left:8px;font-family:var(--mono);font-size:12.5px;color:#B49C8E}
    .cmd b{color:#F5B841}
    pre{margin:0;padding:18px 20px;font-family:var(--mono);font-size:13px;line-height:1.55;
      color:#E7DACE;white-space:pre-wrap;word-break:break-word}
    .green{color:#8FE3AE}.red{color:#FCA48F}.amber{color:#F5B841}.dim{color:#6E5B4E}
    .head{color:#E9A06F;font-weight:600}
  </style></head><body><div class="term"><div class="bar">
    <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
    <span class="cmd">$ <b>${esc(command)}</b></span>
    <span class="cmd" style="margin-left:auto;color:#6E5B4E">${esc(title)}</span>
  </div><pre>${body}</pre></div></body></html>`;
}

// document lives in the browser context; reach it via globalThis so tsc (Node libs) is happy.
async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(() =>
    (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document.fonts.ready,
  );
}

async function shotFull(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  await fontsReady(page);
  await page.waitForTimeout(220);
  await page.screenshot({ path: join(OUT, name), fullPage: true });
  note(name);
}
async function shotEl(page: Page, selector: string, name: string): Promise<void> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await el.screenshot({ path: join(OUT, name) });
  note(name);
}
async function shotTerminal(ctx: BrowserContext, title: string, command: string, output: string, name: string): Promise<void> {
  const page = await ctx.newPage();
  try {
    await page.setContent(terminalHtml(title, command, output), { waitUntil: 'load' });
    await fontsReady(page);
    await page.waitForTimeout(120);
    await page.locator('.term').screenshot({ path: join(OUT, name) });
    note(name);
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  console.log('OvenClear evidence capture — real live-execution screenshots @2x\n');

  // 0. Fresh dashboard data (deterministic) + featured qrIds from the real export.
  const { dataPath } = await writeVerifyData({ quiet: true });
  const sandbox: { window: { OVENCLEAR_VERIFY?: { featured: { labelQrId: string; reissueQrId: string } } } } = { window: {} };
  createContext(sandbox);
  runInContext(readFileSync(dataPath, 'utf8'), sandbox);
  const featured = sandbox.window.OVENCLEAR_VERIFY?.featured ?? { labelQrId: '', reissueQrId: '' };

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const indexUrl = pathToFileURL(join(VERIFY, 'index.html')).href;
  const labelUrl = (qr: string): string => pathToFileURL(join(VERIFY, 'label.html')).href + `?qr=${encodeURIComponent(qr)}`;

  const browser: Browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 900 } });

    // ── 1. the /verify dashboard + panels ──────────────────────────────────
    const page = await ctx.newPage();
    await shotFull(page, indexUrl, '01-dashboard-full.png');
    await shotEl(page, '#panel-counters', '02-live-counters.png');
    await shotEl(page, '#panel-cleared', '03-verdict-cleared.png');
    await shotEl(page, '#panel-refusal', '04-verdict-refusal.png');
    await shotEl(page, '#panel-label', '05-label-artifact-qr.png');
    await shotEl(page, '#panel-lawwatch', '06-lawwatch-reissue-ledger.png');
    await shotEl(page, '#panel-merkle', '07-merkle-tamper-badge.png');
    await page.close();

    // ── 2. the per-label QR provenance pages ───────────────────────────────
    const p2 = await ctx.newPage();
    await shotFull(p2, labelUrl(featured.reissueQrId), '08-qr-provenance-reissued.png');
    await shotFull(p2, labelUrl(featured.labelQrId), '09-qr-provenance-original.png');
    await p2.close();

    // ── 3. terminal evidence — REAL captured stdout ────────────────────────
    await shotTerminal(ctx, 'end-to-end offline proof', 'npm run self-test', run('npx', ['tsx', 'scripts/self_test.ts']), '10-terminal-self-test.png');
    await shotTerminal(ctx, 'chain + signatures + Merkle + tamper localization', 'npm run verify-ledger', run('npx', ['tsx', 'scripts/verify_ledger.ts']), '11-terminal-verify-ledger.png');
    await shotTerminal(ctx, 'verdict p50/p95 + zero-flip gate', 'npm run bench', run('npx', ['tsx', 'scripts/bench.ts']), '12-terminal-bench.png');
    await shotTerminal(ctx, 'statute-cited verdict', 'rulekit check --state GA --product sourdough --venue farmers-market', run('npx', ['tsx', 'src/cli.ts', 'check', '--state', 'GA', '--product', 'sourdough', '--venue', 'farmers-market']), '13-terminal-cli-check-cleared.png');
    await shotTerminal(ctx, 'the refusal — proves it is not a yes-machine', 'rulekit check --state GA --product cheesecake --venue farmers-market', run('npx', ['tsx', 'src/cli.ts', 'check', '--state', 'GA', '--product', 'cheesecake', '--venue', 'farmers-market']), '14-terminal-cli-check-refusal.png');
    await shotTerminal(ctx, 'law diff → materiality → impact', 'rulekit diff --state TX --from 2026-06 --to 2026-07', run('npx', ['tsx', 'src/cli.ts', 'diff', '--state', 'TX', '--from', '2026-06', '--to', '2026-07']), '15-terminal-cli-diff.png');
    await shotTerminal(ctx, 'compliant label + byte-verbatim QA gate (I2)', 'rulekit label --state GA --business "Rosa\'s Bakes"', run('npx', ['tsx', 'src/cli.ts', 'label', '--state', 'GA', '--business', "Rosa's Bakes"]), '16-terminal-cli-label.png');
    await shotTerminal(ctx, 'unified CLI', 'rulekit --help', run('npx', ['tsx', 'src/cli.ts', '--help']), '17-terminal-cli-help.png');

    await ctx.close();
  } finally {
    await browser.close();
  }

  console.log(`\n${shots.length} screenshots written to ${rel(OUT)}/ (all @2x, real runs)`);
  if (shots.length < 15) {
    console.error(`evidence: FAIL — need ≥15 screenshots, got ${shots.length}`);
    process.exit(1);
  }
  console.log('evidence: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
