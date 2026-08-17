# Contributing to OvenClear

Thanks for your interest in OvenClear. This project is a compliance decision
engine: a wrong answer is a real-world harm, so the bar for changing behavior is
deliberately high. The rules below exist to keep it that way.

## Getting Started

```bash
git clone https://github.com/edycutjong/ovenclear.git
cd ovenclear
npm install
cp .env.example .env    # optional — the core runs with no keys at all
npm run ci              # typecheck → tests → seed:check → self-test → verify-ledger → bench
```

Node ≥ 18.17 (CI runs 20 and 22). No API key, account, or network access is
needed for anything above.

## Before You Open a PR

- `npm run ci` exits 0. This is the whole gate — it is what CI runs.
- Add or update tests for **any** behavior change.
- Keep commits conventional: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
- Never commit a filled-in `.env`, a real API key, or anything under
  `evidence-pack/` (it contains customer PII).

## Changing Rule Data — read this first

Rule data lives in pinned snapshots and rulepacks, not in code branches.

1. **Every citation quote must be a verbatim substring of its pinned snapshot.**
   This is enforced at rulepack registration; a paraphrase will fail to register.
2. **`npm run seed:check` must stay green.** It re-hashes the fixtures against the
   committed golden baseline (`scripts/seed.baseline.json`). If your change is
   intentional, regenerate the baseline with `npm run seed` in the same commit and
   say so in the PR description.
3. **Golden verdict flips must stay at 0.** `npm run bench` fails the build if a
   rulepack edit silently changes an existing answer. If a flip is correct, change
   the golden case in the same PR and explain why.
4. All rule text in this repo is **FIXTURE / synthetic** — statute-*shaped*, never
   verbatim law. Do not paste real statute text into the fixtures.

## Naming Tests

Regression tests are named after the defect they pin, not the function they call:

```ts
// ✅ the test list reads as a changelog of real bugs
it('rejects a citation quote that is not a verbatim substring of its snapshot', ...)

// ❌ opaque — proves nothing to a reader
it('works', ...)
```

## Reporting Bugs / Requesting Features

Open an issue using the templates. For a wrong verdict, include the exact CLI
invocation (`state`, `product`, `venue`), the verdict you got, and the verdict you
expected — that triple is what makes it reproducible.

## Security

Do **not** open a public issue for a vulnerability. See
[SECURITY.md](SECURITY.md).
