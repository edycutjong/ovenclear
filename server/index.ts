import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { loadConfig, describe } from './config';
import { buildProductionWorld, type ProdWorld } from './world';
import { ProductResolver } from './product-resolver';
import { Stripe, verifyWebhook, WebhookVerificationError, StripeError } from './stripe';
import { fulfill, newOrder, quote, IntakeError } from './fulfill';
import { logEvent, type Order, type OrderIntake } from './store';
import { errorPage, howItWorks, landing, orderPage, provenancePage, quotePage, startForm } from './pages';
import { privacyPage, refundsPage, termsPage } from './legal';

/**
 * OvenClear storefront.
 *
 * Plain node:http rather than a framework — the whole surface is a dozen
 * routes, and every dependency in a service that takes payments is a
 * dependency someone has to trust.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const VERIFY_DIR = join(REPO_ROOT, 'verify');
const MAX_BODY_BYTES = 64 * 1024;

const cfg = loadConfig();
const stripe = cfg.stripeSecretKey ? new Stripe(cfg.stripeSecretKey) : null;
const resolver = new ProductResolver(cfg.geminiApiKey);

let world: ProdWorld;

// ── tiny http helpers ───────────────────────────────────────────────────────

function send(res: ServerResponse, status: number, body: string | Buffer, type = 'text/html; charset=utf-8'): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { Location: location });
  res.end();
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

function intakeFromForm(f: Record<string, string>): OrderIntake {
  return {
    state: (f.state ?? '').trim(),
    productDescription: (f.productDescription ?? '').trim(),
    venue: (f.venue ?? '').trim(),
    businessName: (f.businessName ?? '').trim(),
    city: (f.city ?? '').trim(),
    ingredients: (f.ingredients ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    contactEmail: (f.contactEmail ?? '').trim(),
    ...((f.netWeight ?? '').trim() ? { netWeight: f.netWeight!.trim() } : {}),
  };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serve the committed /verify dashboard. Path traversal is refused. */
function serveVerify(res: ServerResponse, urlPath: string): boolean {
  const rel = urlPath.replace(/^\/verify\/?/, '') || 'index.html';
  const target = join(VERIFY_DIR, normalize(rel));
  if (!target.startsWith(VERIFY_DIR)) return false;
  if (!existsSync(target)) return false;
  const st = statSync(target);
  const file = st.isDirectory() ? join(target, 'index.html') : target;
  if (!existsSync(file)) return false;
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=300',
  });
  createReadStream(file).pipe(res);
  return true;
}

// ── routes ──────────────────────────────────────────────────────────────────

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', cfg.baseUrl);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (path === '/healthz') return send(res, 200, 'ok', 'text/plain; charset=utf-8');

  // Stripe webhook — must read the RAW body before anything parses it.
  if (path === '/webhooks/stripe' && method === 'POST') return handleWebhook(req, res);

  if (method === 'GET') {
    if (path === '/') return send(res, 200, landing(cfg));
    if (path === '/how-it-works') return send(res, 200, howItWorks(cfg, world.geminiLive));
    if (path === '/start') return send(res, 200, startForm(cfg));
    // Stripe will not activate a live account without these reachable.
    if (path === '/terms') return send(res, 200, termsPage(cfg));
    if (path === '/privacy') return send(res, 200, privacyPage(cfg));
    if (path === '/refunds') return send(res, 200, refundsPage(cfg));
    if (path === '/success') return handleSuccess(url, res);
    if (path === '/ledger.jsonl') {
      return send(res, 200, world.ledger.toJsonl(), 'application/x-ndjson; charset=utf-8');
    }
    if (path.startsWith('/verify')) {
      if (serveVerify(res, path)) return;
      return send(res, 404, errorPage(404, 'Not found', 'That file is not part of the verify bundle.'));
    }

    const orderMatch = /^\/order\/([a-f0-9]{32})(\/label\.txt)?$/.exec(path);
    if (orderMatch) {
      const order = world.store.getOrderByToken(orderMatch[1]!);
      if (!order) {
        return send(res, 404, errorPage(404, 'No such order', 'That delivery link is not one of ours.'));
      }
      if (orderMatch[2]) {
        if (!order.label) return send(res, 404, errorPage(404, 'Not ready', 'This label has not been issued yet.'));
        return send(res, 200, order.label.text, 'text/plain; charset=utf-8');
      }
      return send(res, 200, orderPage(cfg, order));
    }

    const qrMatch = /^\/l\/([A-Za-z0-9_]+)$/.exec(path);
    if (qrMatch) {
      const entry = world.registry.get(qrMatch[1]!);
      if (!entry) {
        return send(res, 404, errorPage(404, 'Unknown label', 'No label with that code has been issued.'));
      }
      const order = world.store.allOrders().find((o) => o.qrId === entry.qrId);
      return send(res, 200, provenancePage(entry, order?.label ?? null));
    }
  }

  if (method === 'POST' && path === '/quote') return handleQuote(req, res);
  if (method === 'POST' && path === '/checkout') return handleCheckout(req, res);

  return send(res, 404, errorPage(404, 'Not found', 'There is nothing at that address.'));
}

async function handleQuote(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const form = parseForm(await readBody(req));
  const intake = intakeFromForm(form);
  try {
    const q = await quote(world, resolver, intake);
    return send(res, 200, quotePage(cfg, q, intake, Boolean(stripe)));
  } catch (e) {
    if (e instanceof IntakeError) {
      return send(
        res,
        400,
        startForm(cfg, intake, { message: e.message, field: e.field, suggestions: e.suggestions }),
      );
    }
    throw e;
  }
}

async function handleCheckout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!stripe) {
    return send(res, 503, errorPage(503, 'Checkout is off', 'This instance has no Stripe key configured.'));
  }
  const form = parseForm(await readBody(req));
  const intake = intakeFromForm(form);

  // Re-run the engine server-side: the client cannot talk us into selling a
  // label for a product the state prohibits by editing a hidden field.
  let q;
  try {
    q = await quote(world, resolver, intake);
  } catch (e) {
    if (e instanceof IntakeError) {
      return send(
        res,
        400,
        startForm(cfg, intake, { message: e.message, field: e.field, suggestions: e.suggestions }),
      );
    }
    throw e;
  }
  if (!q.sellable) return send(res, 200, quotePage(cfg, q, intake, Boolean(stripe)));

  const order = newOrder(intake, cfg.priceUsd);
  world.store.putOrder(order);

  try {
    const session = await stripe.createCheckoutSession({
      orderId: order.orderId,
      amountUsd: order.amountUsd,
      productName: `OvenClear compliance pack — ${q.verdict.product.canonical} (${q.verdict.state})`,
      productDescription:
        'Statute-cited verdict, print-ready compliant label, licensing checklist, and Law-Watch re-issue.',
      customerEmail: intake.contactEmail,
      successUrl: `${cfg.baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${cfg.baseUrl}/start`,
    });
    order.stripeSessionId = session.id;
    world.store.putOrder(order);
    world.record('sales_agent', 'checkout_started', {
      orderId: order.orderId,
      amountUsd: order.amountUsd,
      stripeSessionId: session.id,
      livemode: stripe.isLive,
      state: q.verdict.state,
      product: q.verdict.product.canonical,
    });
    if (!session.url) throw new Error('Stripe returned no checkout URL');
    return redirect(res, session.url);
  } catch (e) {
    const msg = e instanceof StripeError ? e.message : (e as Error).message;
    logEvent('checkout_failed', { orderId: order.orderId, error: msg });
    order.status = 'failed';
    order.failureReason = `checkout could not be created: ${msg}`;
    world.store.putOrder(order);
    return send(
      res,
      502,
      errorPage(502, 'Checkout could not start', 'We could not reach Stripe. You have not been charged.'),
    );
  }
}

/**
 * The success page is a convenience, not the source of truth — the webhook is.
 * It confirms payment directly with Stripe and fulfils if the webhook has not
 * landed yet, which is common because the browser usually wins that race.
 */
async function handleSuccess(url: URL, res: ServerResponse): Promise<void> {
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId || !stripe) {
    return send(res, 400, errorPage(400, 'Missing session', 'That link is incomplete.'));
  }
  const order = world.store.getOrderBySession(sessionId);
  if (!order) {
    return send(res, 404, errorPage(404, 'Unknown order', 'We do not have an order for that session.'));
  }
  try {
    const session = await stripe.retrieveSession(sessionId);
    if (session.payment_status === 'paid') await markPaidAndFulfill(order, session.payment_intent);
  } catch (e) {
    logEvent('success_confirm_failed', { orderId: order.orderId, error: (e as Error).message });
  }
  return redirect(res, `/order/${order.token}`);
}

async function markPaidAndFulfill(order: Order, paymentIntent: string | null): Promise<void> {
  if (order.status === 'fulfilled' || order.status === 'refused') return;
  if (order.status === 'pending_payment') {
    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    order.stripePaymentIntentId = paymentIntent;
    world.record('sales_agent', 'payment_received', {
      orderId: order.orderId,
      amountUsd: order.amountUsd,
      currency: 'usd',
      stripePaymentIntentId: paymentIntent,
      livemode: stripe?.isLive ?? false,
    });
    world.store.putOrder(order);
  }
  await fulfill(world, resolver, order, `${cfg.baseUrl}/l`);
}

async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!cfg.stripeWebhookSecret) return send(res, 503, 'webhooks not configured', 'text/plain');
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    return send(res, 413, 'body too large', 'text/plain');
  }

  let event;
  try {
    event = verifyWebhook(raw, req.headers['stripe-signature'] as string | undefined, cfg.stripeWebhookSecret);
  } catch (e) {
    // 400 tells Stripe not to retry — a bad signature will never become good.
    logEvent('webhook_rejected', {
      error: e instanceof WebhookVerificationError ? e.message : String(e),
    });
    return send(res, 400, 'signature verification failed', 'text/plain');
  }

  logEvent('webhook_received', { id: event.id, type: event.type });

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as {
      id?: string;
      payment_intent?: string | null;
      payment_status?: string;
      client_reference_id?: string | null;
    };
    const order =
      (session.client_reference_id ? world.store.getOrder(session.client_reference_id) : undefined) ??
      (session.id ? world.store.getOrderBySession(session.id) : undefined);

    if (!order) {
      logEvent('webhook_no_matching_order', { sessionId: session.id ?? null });
    } else if (session.payment_status === 'paid') {
      try {
        await markPaidAndFulfill(order, session.payment_intent ?? null);
      } catch (e) {
        // 500 makes Stripe retry, which is what we want for a transient fault.
        logEvent('webhook_fulfill_error', { orderId: order.orderId, error: (e as Error).message });
        return send(res, 500, 'fulfillment error', 'text/plain');
      }
    }
  }

  return send(res, 200, JSON.stringify({ received: true }), 'application/json');
}

// ── boot ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  world = await buildProductionWorld(cfg);

  const server = createServer((req, res) => {
    const started = Date.now();
    handle(req, res)
      .catch((e: Error) => {
        logEvent('unhandled_error', { path: req.url ?? '', error: e.message, stack: e.stack });
        if (!res.headersSent) {
          send(res, 500, errorPage(500, 'Something broke on our side', 'This has been logged. Nothing was charged.'));
        }
      })
      .finally(() => {
        logEvent('http', {
          method: req.method ?? '',
          path: (req.url ?? '').split('?')[0],
          status: res.statusCode,
          ms: Date.now() - started,
        });
      });
  });

  server.listen(cfg.port, () => {
    logEvent('server_started', {
      banner: describe(cfg),
      ledgerRows: world.ledger.size,
      states: world.engine.states(),
      geminiLive: world.geminiLive,
      stripe: stripe ? (stripe.isLive ? 'live' : 'test') : 'off',
    });
    process.stdout.write(`OvenClear listening on :${cfg.port} — ${describe(cfg)}\n`);
  });

  const shutdown = (sig: string) => () => {
    logEvent('shutdown', { signal: sig });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}

main().catch((e: Error) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
