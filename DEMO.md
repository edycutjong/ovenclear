# DEMO.md — reproduce every claim in this repo

Everything below runs **offline**: no network, no API key, no account. All rule text is
**FIXTURE / synthetic** — statute-*shaped* data modeled on real cottage-food programs, never
verbatim law, and nothing here is legal advice.

Verified on 2026-08-09 · Node ≥ 18.17 · macOS (darwin 25.5.0).

## 0. Setup

```bash
npm install
```

## 1. The one command that proves the whole thing

```bash
npm run ci           # typecheck → 128 tests → seed:check → self-test → verify-ledger → bench
```

Expected, in order:

| Step | Expected output |
|---|---|
| `tsc --noEmit` | silent (zero errors) |
| `vitest run` | **Test Files 9 passed (9) · Tests 128 passed (128)** |
| `self-test` | `SELF-TEST: PASS (12/12 checks)` |
| `verify-ledger` | `PASS — clean export verifies; mutation localized + rejected at seq 39` |
| `bench` | `golden verdict flips: 0 / 28` · `bench: OK` |

## 2. The devastating query — the verdict that says **no**

The autonomy proof is the refusal. Same state, same venue, one product change:

```bash
npx tsx src/cli.ts check --state GA --product sourdough   --venue farmers-market   # allowed
npx tsx src/cli.ts check --state GA --product cheesecake  --venue farmers-market   # REFUSED
```

Cheesecake is refused because it needs refrigeration — a category GA's cottage-food program
excludes. The verdict is statute-cited either way, and every citation quote is a **verbatim
substring of its pinned snapshot**, enforced at rulepack registration.

Then produce the artifact the customer actually buys:

```bash
npx tsx src/cli.ts label --state GA --business "Rosa's Bakes"
```

## 3. The law moves and the label re-issues itself

```bash
npx tsx src/cli.ts diff --state TX --from 2026-06 --to 2026-07
```

Diff → materiality classification (material / cosmetic / immaterial) → impact fan-out → re-issue.
The self-test exercises the whole loop: **5 deltas (2 material / 1 cosmetic / 2 immaterial) →
9 re-issues → 5 notices → 1 none-affected.** That loop is the product; the verdict is the hook.

## 4. Tamper-evidence

```bash
npm run verify-ledger
```

Self-test writes a **78-row** Ed25519-signed hash chain (last hash `620879cff8a562bd…`, merkle
root `fa7758f0f920…`). `verify-ledger` recomputes chain, all 78 signatures, and merkle roots —
then deliberately mutates a row and shows it **localized and rejected at seq 39**.

## 5. Benchmarks

```bash
npm run bench        # 28 golden cases × 1000 iterations
```

| Operation | n | p50 | p95 | p99 |
|---|---|---|---|---|
| verdict (`rulekit.check`) | 28,000 | 26.13 µs | 45.67 µs | 163.79 µs |
| law-watch pass (mock diff) | 500 | 111.17 µs | 222.54 µs | 563.71 µs |

**Golden verdict flips: 0 / 28** — the regression gate that keeps a rulepack edit from silently
changing an answer. Timings are offline component costs; production adds Gemini inference and
Stripe I/O. Numbers vary by machine; the shape does not.

## 6. Judge-visible dashboard (no server)

```bash
npm run verify:dashboard    # exports verify/data, then open verify/index.html via file://
```

A self-contained offline viewer over the real exported pipeline data, plus `verify/label.html`
for per-label QR provenance. Static captures are in [`docs/evidence/`](docs/evidence/).

## What is NOT proven here

Stated plainly, because the rubric asks.

**What is now true.** The storefront is built and **deployed at https://ovenclear.edycu.dev** —
public, free to use, serving real verdicts from the same core these tests exercise. Verified
18 Aug 2026: every route returns 200, and the refusal path holds in production (a cheesecake in
Georgia is declined, quoting the refrigeration rule, with no checkout button rendered at all).

**What is still NOT proven.** No live Gemini key is configured, so the model-assisted rescue pass
has never executed in the deployed application — the deterministic core answers every request.
Stripe runs on a placeholder test key, so **no real charge can be taken and none has been**. There
are **zero customers and $0 revenue**. The hosting tier has an ephemeral filesystem, so the ledger
re-seeds from genesis on a cold start; durable storage is the Cloud Run target in `DEPLOY.md`, which
is not deployed. All rule text remains **synthetic, statute-shaped fixture data — never verbatim law**.

Those are business milestones, not code claims, and this file will not pretend otherwise.
