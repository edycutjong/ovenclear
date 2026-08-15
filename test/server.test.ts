import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formEncode, verifyWebhook, WebhookVerificationError } from '../server/stripe';
import { buildProductionWorld, type ProdWorld } from '../server/world';
import { ProductResolver } from '../server/product-resolver';
import { fulfill, newOrder, quote, IntakeError } from '../server/fulfill';
import { Store, type OrderIntake } from '../server/store';
import { DecisionLedger } from '../src/core/ledger/ledger';
import { verifyChain } from '../src/core/ledger/verify';
import type { Config } from '../server/config';

/**
 * Storefront tests.
 *
 * These cover the parts of the deployed service that the offline core does
 * not: money handling, webhook authenticity, order persistence, and the rule
 * that a prohibited verdict must never turn into a sale.
 */

let dir: string;

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    mode: 'dev',
    port: 0,
    baseUrl: 'http://localhost:8080',
    dataDir: dir,
    priceUsd: 19,
    stripeSecretKey: null,
    stripeWebhookSecret: null,
    geminiApiKey: null,
    ledgerKeyNamespace: 'ovenclear-test',
    supportEmail: 'support@example.com',
    ...overrides,
  };
}

const GOOD_INTAKE: OrderIntake = {
  state: 'GA',
  productDescription: 'sourdough',
  venue: 'farmers_market',
  businessName: "Rosa's Bakes",
  city: 'Marietta, GA',
  ingredients: ['wheat flour', 'water', 'sea salt'],
  contactEmail: 'rosa@example.com',
  netWeight: '1 lb (454 g)',
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ovenclear-test-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ── Stripe form encoding ────────────────────────────────────────────────────

describe('formEncode', () => {
  it('encodes nested objects with bracketed paths', () => {
    expect(formEncode({ metadata: { orderId: 'ord_1' } })).toBe('metadata%5BorderId%5D=ord_1');
  });

  it('encodes arrays of objects by index', () => {
    const out = formEncode({ line_items: [{ quantity: 1, price_data: { currency: 'usd' } }] });
    expect(out).toContain('line_items%5B0%5D%5Bquantity%5D=1');
    expect(out).toContain('line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd');
  });

  it('drops null and undefined rather than sending the string "null"', () => {
    expect(formEncode({ a: 1, b: null, c: undefined })).toBe('a=1');
  });
});

// ── webhook verification ────────────────────────────────────────────────────

describe('verifyWebhook', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });
  const sign = (ts: number, payload = body, key = secret): string =>
    `t=${ts},v1=${createHmac('sha256', key).update(`${ts}.${payload}`, 'utf8').digest('hex')}`;

  it('accepts a correctly signed payload', () => {
    const now = 1_800_000_000;
    const evt = verifyWebhook(body, sign(now), secret, 300, now);
    expect(evt.type).toBe('checkout.session.completed');
  });

  it('rejects a signature made with the wrong secret', () => {
    const now = 1_800_000_000;
    expect(() => verifyWebhook(body, sign(now, body, 'whsec_wrong'), secret, 300, now)).toThrow(
      WebhookVerificationError,
    );
  });

  it('rejects a replayed payload outside the tolerance window', () => {
    const now = 1_800_000_000;
    expect(() => verifyWebhook(body, sign(now - 4000), secret, 300, now)).toThrow(/tolerance/);
  });

  it('rejects a tampered body that keeps a valid-looking header', () => {
    const now = 1_800_000_000;
    const header = sign(now);
    const tampered = body.replace('evt_1', 'evt_2');
    expect(() => verifyWebhook(tampered, header, secret, 300, now)).toThrow(WebhookVerificationError);
  });

  it('rejects a missing header', () => {
    expect(() => verifyWebhook(body, undefined, secret)).toThrow(/missing Stripe-Signature/);
  });
});

// ── quote + fulfillment ─────────────────────────────────────────────────────

describe('order pipeline', () => {
  let world: ProdWorld;
  let resolver: ProductResolver;

  beforeEach(async () => {
    world = await buildProductionWorld(testConfig());
    resolver = new ProductResolver(null); // no key: deterministic catalog only
  });

  it('produces a sellable eligible verdict for GA sourdough', async () => {
    const q = await quote(world, resolver, GOOD_INTAKE);
    expect(q.verdict.status).toBe('eligible');
    expect(q.sellable).toBe(true);
    expect(q.resolved.canonical).toBe('sourdough bread');
    expect(q.resolved.viaGemini).toBe(false);
    expect(q.verdict.snapshotHashes.length).toBeGreaterThan(0); // invariant I1
  });

  it('marks a prohibited product as not sellable', async () => {
    const q = await quote(world, resolver, { ...GOOD_INTAKE, productDescription: 'cheesecake' });
    expect(q.verdict.status).toBe('prohibited');
    expect(q.sellable).toBe(false);
  });

  it('raises IntakeError with suggestions for an unknown product', async () => {
    await expect(
      quote(world, resolver, { ...GOOD_INTAKE, productDescription: 'zzzz not a food' }),
    ).rejects.toBeInstanceOf(IntakeError);
  });

  it('raises IntakeError for a malformed email rather than charging', async () => {
    await expect(
      quote(world, resolver, { ...GOOD_INTAKE, contactEmail: 'not-an-email' }),
    ).rejects.toThrow(IntakeError);
  });

  it('issues a QA-passing label on fulfillment', async () => {
    const order = newOrder(GOOD_INTAKE, 19);
    world.store.putOrder(order);
    const done = await fulfill(world, resolver, order, 'http://localhost:8080/l');

    expect(done.status).toBe('fulfilled');
    expect(done.label).not.toBeNull();
    expect(done.label!.text).toContain("Rosa's Bakes");
    expect(done.label!.fields.allergenLine).toBe('CONTAINS: WHEAT');
    expect(done.qrId).toBe(done.label!.qrId);
  });

  it('is idempotent — a webhook retry does not issue a second label', async () => {
    const order = newOrder(GOOD_INTAKE, 19);
    world.store.putOrder(order);
    const first = await fulfill(world, resolver, order, 'http://localhost:8080/l');
    const labelId = first.label!.labelId;
    const rowsAfterFirst = world.ledger.size;

    const second = await fulfill(world, resolver, first, 'http://localhost:8080/l');
    expect(second.label!.labelId).toBe(labelId);
    expect(world.ledger.size).toBe(rowsAfterFirst); // no new ledger rows
    expect(world.registry.mustGet(second.qrId!).issueHistory).toHaveLength(1);
  });

  it('refuses to issue a label for a paid prohibited order and flags a refund', async () => {
    const order = newOrder({ ...GOOD_INTAKE, productDescription: 'cheesecake' }, 19);
    world.store.putOrder(order);
    const done = await fulfill(world, resolver, order, 'http://localhost:8080/l');

    expect(done.status).toBe('refused');
    expect(done.label).toBeNull();
    const refusal = world.ledger.byKind('label_refused_prohibited');
    expect(refusal).toHaveLength(1);
    expect((refusal[0]!.payload as { refundDue: boolean }).refundDue).toBe(true);
  });

  it('writes a ledger whose chain and signatures verify', async () => {
    const order = newOrder(GOOD_INTAKE, 19);
    world.store.putOrder(order);
    await fulfill(world, resolver, order, 'http://localhost:8080/l');

    const report = verifyChain(world.ledger.all());
    expect(report.ok).toBe(true);
    expect(report.problems).toHaveLength(0);
    expect(report.signaturesChecked).toBe(world.ledger.size);
  });
});

// ── durability ──────────────────────────────────────────────────────────────

describe('persistence', () => {
  it('reloads orders and rehydrates the signed ledger across a restart', async () => {
    const cfg = testConfig();
    const first = await buildProductionWorld(cfg);
    const resolver = new ProductResolver(null);
    const order = newOrder(GOOD_INTAKE, 19);
    first.store.putOrder(order);
    await fulfill(first, resolver, order, 'http://localhost:8080/l');
    const sizeBefore = first.ledger.size;
    const lastHash = first.ledger.lastHash;

    // Fresh process, same data dir.
    const second = await buildProductionWorld(cfg);
    expect(second.ledger.size).toBe(sizeBefore);
    expect(second.ledger.lastHash).toBe(lastHash);
    expect(second.store.getOrderByToken(order.token)?.status).toBe('fulfilled');

    // The chain still extends correctly after restore.
    second.record('test_agent', 'post_restart', { ok: true });
    expect(verifyChain(second.ledger.all()).ok).toBe(true);
  });

  it('restores QR provenance so a scanned label still resolves after a restart', async () => {
    const cfg = testConfig();
    const first = await buildProductionWorld(cfg);
    const order = newOrder(GOOD_INTAKE, 19);
    first.store.putOrder(order);
    const done = await fulfill(first, new ProductResolver(null), order, 'http://localhost:8080/l');

    const second = await buildProductionWorld(cfg);
    const entry = second.registry.get(done.qrId!);
    expect(entry).toBeDefined();
    expect(entry!.issueHistory).toHaveLength(1);
  });

  it('refuses to restore a tampered ledger instead of silently continuing it', async () => {
    const cfg = testConfig();
    const w = await buildProductionWorld(cfg);
    w.record('test_agent', 'row', { n: 1 });

    const path = join(dir, 'ledger.jsonl');
    const rows = DecisionLedger.parseJsonl(readFileSync(path, 'utf8'));
    rows[rows.length - 1]!.payload = { n: 999 }; // tamper

    expect(() => DecisionLedger.restore(rows, w.keyring)).toThrow(/does not recompute/);
  });

  it('survives a torn final write rather than refusing to boot', () => {
    const store = Store.open(dir);
    const order = newOrder(GOOD_INTAKE, 19);
    store.putOrder(order);
    // Simulate a half-flushed row appended after a clean one.
    appendFileSync(join(dir, 'orders.jsonl'), '{"orderId":"ord_tr', 'utf8');

    const reopened = Store.open(dir);
    expect(reopened.getOrder(order.orderId)).toBeDefined();
    expect(reopened.allOrders()).toHaveLength(1);
  });

  it('creates the data directory if it does not exist', () => {
    const nested = join(dir, 'deep', 'nested');
    expect(existsSync(nested)).toBe(false);
    Store.open(nested);
    expect(existsSync(nested)).toBe(true);
  });
});
