#!/usr/bin/env node
/**
 * Post-deploy smoke test.
 *
 *   node scripts/smoke.mjs https://ovenclear.edycu.dev
 *
 * Exits non-zero if the storefront is not serving correctly. CI runs it twice:
 * once against the raw deployment URL *before* the production domains move, and
 * once against the live custom domain *after*. A deploy that cannot pass this
 * never takes traffic.
 *
 * Three checks, in order of how badly a failure would hurt:
 *
 *  1. `/healthz` returns exactly `ok`. If the serverless bundle (api/index.js,
 *     built by scripts/build-vercel.mjs) is missing, this is what catches it.
 *
 *  2. `/` serves the storefront shell. Catches a function that boots but routes
 *     to nothing.
 *
 *  3. THE INVARIANT. A prohibited product must be refused, and the refusal page
 *     must contain no way to pay: zero occurrences of `checkout`, zero `<button`.
 *     GA + cheesecake at a farmers market is a hard refusal (needs refrigeration
 *     → outside cottage-food). If a regression ever lets the storefront sell a
 *     label for a product the state prohibits, that is the one bug that turns
 *     this product into a liability, so it fails the deploy.
 *
 * Cold starts on a serverless runtime are slow and occasionally drop the first
 * request, so every check retries with backoff before it is believed.
 */

const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('usage: node scripts/smoke.mjs <base-url>');
  process.exit(2);
}

const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS ?? 6);
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 25_000);

/** The refusal case. Field names and the venue enum come from server/index.ts. */
const REFUSAL_INTAKE = {
  state: 'GA',
  productDescription: 'cheesecake',
  venue: 'farmers_market',
  businessName: 'OvenClear CI Smoke',
  city: 'Marietta',
  ingredients: 'cream cheese, sugar, eggs, wheat flour',
  contactEmail: 'ci-smoke@ovenclear.invalid',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(path, init = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, { ...init, signal: ctl.signal, redirect: 'follow' });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run `check` until it stops throwing. `check` receives the response and must
 * throw a plain Error describing what it wanted when the response is wrong.
 */
async function retrying(name, path, init, check) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetchOnce(path, init);
      check(res);
      console.log(`  PASS  ${name}`);
      return;
    } catch (e) {
      last = e;
      const why = e instanceof Error ? e.message : String(e);
      if (attempt < ATTEMPTS) {
        const wait = Math.min(1000 * 2 ** (attempt - 1), 8000);
        console.log(`  ....  ${name} — attempt ${attempt}/${ATTEMPTS} failed (${why}); retrying in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw new Error(`${name}: ${last instanceof Error ? last.message : String(last)}`);
}

function countOf(haystack, needle) {
  return haystack.split(needle).length - 1;
}

async function main() {
  console.log(`smoke: ${base}`);

  await retrying('GET /healthz returns "ok"', '/healthz', {}, ({ status, body }) => {
    if (status !== 200) throw new Error(`expected 200, got ${status}`);
    if (body.trim() !== 'ok') throw new Error(`expected body "ok", got ${JSON.stringify(body.slice(0, 120))}`);
  });

  await retrying('GET / serves the storefront', '/', {}, ({ status, body }) => {
    if (status !== 200) throw new Error(`expected 200, got ${status}`);
    if (!body.includes('OvenClear')) throw new Error('storefront shell did not mention OvenClear');
  });

  await retrying(
    'POST /quote refuses GA/cheesecake with no way to pay',
    '/quote',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(REFUSAL_INTAKE).toString(),
    },
    ({ status, body }) => {
      if (status !== 200) {
        // A 400 here means intake validation rejected the case before the engine
        // ever ran — the invariant was never actually exercised. Treat as failure.
        throw new Error(`expected 200 from the engine, got ${status} (intake rejected before the verdict?)`);
      }
      const lower = body.toLowerCase();
      if (!lower.includes('not allowed')) {
        throw new Error('expected a refusal verdict ("Not allowed") and did not get one');
      }
      const checkouts = countOf(lower, 'checkout');
      const buttons = countOf(lower, '<button');
      if (checkouts !== 0 || buttons !== 0) {
        throw new Error(
          `INVARIANT BREACH: a refusal page offered a way to pay — ` +
            `"checkout" x${checkouts}, "<button" x${buttons}`,
        );
      }
    },
  );

  console.log('smoke: all checks passed');
}

main().catch((e) => {
  console.error(`\nsmoke FAILED against ${base}`);
  console.error(`  ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
