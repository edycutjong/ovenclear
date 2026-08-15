import { randomBytes, randomUUID } from 'node:crypto';
import { normalizeInterview, InterviewValidationError, type NormalizedCase } from '../src/core/intake/interview';
import { issueLabel } from '../src/core/label/qa';
import { LabelQaError } from '../src/core/label/qa';
import { LabelComposeError } from '../src/core/label/compose';
import { LabelRegistry } from '../src/core/label/registry';
import type { Verdict } from '../src/core/rulekit/types';
import type { ProdWorld } from './world';
import type { ProductResolver, ResolvedProduct } from './product-resolver';
import type { Order, OrderIntake } from './store';
import { logEvent } from './store';

/**
 * The order pipeline: intake → verdict → (pay) → label → ledger.
 *
 * The verdict is computed BEFORE payment, and a prohibited verdict never
 * reaches checkout. That is not a UX nicety — refusing to sell a compliance
 * artifact for a food the state does not allow is the product working, and
 * charging for it would be the product failing.
 */

export interface Quote {
  resolved: ResolvedProduct;
  normalized: NormalizedCase;
  verdict: Verdict;
  /** False for prohibited verdicts — no label can be composed, so no sale. */
  sellable: boolean;
}

export class IntakeError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly suggestions: string[] = [],
  ) {
    super(message);
    this.name = 'IntakeError';
  }
}

/** Run the deterministic engine over an intake. No payment, no side effects. */
export async function quote(
  world: ProdWorld,
  resolver: ProductResolver,
  intake: OrderIntake,
): Promise<Quote> {
  let resolved: ResolvedProduct;
  try {
    resolved = await resolver.resolve(intake.productDescription);
  } catch (e) {
    const err = e as Error & { suggestions?: string[] };
    throw new IntakeError(err.message, 'product', err.suggestions ?? []);
  }

  let normalized: NormalizedCase;
  try {
    // Feed the resolved canonical in so the deterministic normalizer hits the
    // catalog; every other field is validated exactly as the offline core does.
    normalized = normalizeInterview(
      {
        state: intake.state,
        productDescription: resolved.canonical,
        venue: intake.venue,
        businessName: intake.businessName,
        city: intake.city,
        ingredients: intake.ingredients,
        contactEmail: intake.contactEmail,
      },
      world.engine,
    );
  } catch (e) {
    if (e instanceof InterviewValidationError) {
      throw new IntakeError(e.message, e.question, e.suggestions);
    }
    throw e;
  }

  const verdict = world.engine.check({
    state: normalized.state,
    product: resolved.canonical,
    venue: normalized.venue,
    issuedAt: world.clock(),
  });

  world.record('verdict_agent', 'quote_issued', {
    state: verdict.state,
    packVersion: verdict.packVersion,
    productInput: intake.productDescription,
    canonical: resolved.canonical,
    resolvedViaGemini: resolved.viaGemini,
    ...(resolved.geminiModel ? { geminiModel: resolved.geminiModel } : {}),
    venue: verdict.venue,
    status: verdict.status,
    verdictHash: verdict.verdictHash,
    snapshotHashes: verdict.snapshotHashes,
  });

  return { resolved, normalized, verdict, sellable: verdict.status !== 'prohibited' };
}

export function newOrder(intake: OrderIntake, amountUsd: number): Order {
  const now = new Date().toISOString();
  return {
    orderId: `ord_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    token: randomBytes(16).toString('hex'),
    status: 'pending_payment',
    amountUsd,
    intake,
    createdAt: now,
    updatedAt: now,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    paidAt: null,
    verdict: null,
    label: null,
    qrId: null,
    failureReason: null,
  };
}

/**
 * Fulfil a paid order: recompute the verdict, compose + QA-gate the label,
 * and ledger every step. Idempotent — a Stripe webhook retry, or the success
 * page racing the webhook, must not issue a second label.
 */
export async function fulfill(
  world: ProdWorld,
  resolver: ProductResolver,
  order: Order,
  qrBaseUrl: string,
): Promise<Order> {
  if (order.status === 'fulfilled' || order.status === 'refused') return order;

  let q: Quote;
  try {
    q = await quote(world, resolver, order.intake);
  } catch (e) {
    order.status = 'failed';
    order.failureReason = (e as Error).message;
    world.record('label_agent', 'fulfillment_failed', {
      orderId: order.orderId,
      reason: order.failureReason,
    });
    world.store.putOrder(order);
    return order;
  }

  order.verdict = q.verdict;

  // Paid, but the state does not allow it. Fail closed and flag for refund —
  // we do not keep money for a label we refuse to print.
  if (!q.sellable) {
    order.status = 'refused';
    order.failureReason = 'prohibited verdict — label refused, refund due';
    world.record('label_agent', 'label_refused_prohibited', {
      orderId: order.orderId,
      state: q.verdict.state,
      product: q.verdict.product.canonical,
      verdictHash: q.verdict.verdictHash,
      refundDue: true,
      amountUsd: order.amountUsd,
      note: 'no label for a prohibited verdict — the refusal is the product working',
    });
    world.store.putOrder(order);
    logEvent('order_refused', { orderId: order.orderId, refundDue: true });
    return order;
  }

  world.record('verdict_agent', 'verdict_issued', {
    orderId: order.orderId,
    state: q.verdict.state,
    packVersion: q.verdict.packVersion,
    product: q.verdict.product.canonical,
    venue: q.verdict.venue,
    status: q.verdict.status,
    verdictHash: q.verdict.verdictHash,
    snapshotHashes: q.verdict.snapshotHashes,
  });

  const registryEntry = world.registry.create(order.orderId, order.orderId, q.normalized.state);
  const spec = world.engine.labelRequirements(q.normalized.state, q.verdict.packVersion);

  try {
    const { artifact, qa } = issueLabel({
      qrId: registryEntry.qrId,
      businessName: q.normalized.businessName,
      addressLine: q.normalized.addressLine,
      productName: q.normalized.canonicalProduct,
      ingredients: q.normalized.ingredients,
      ...(order.intake.netWeight?.trim() ? { netWeight: order.intake.netWeight.trim() } : {}),
      spec,
      verdict: q.verdict,
      issuedAt: world.clock(),
      qrBaseUrl,
    });
    world.registry.appendIssue(registryEntry.qrId, artifact);

    order.label = artifact;
    order.qrId = artifact.qrId;
    order.status = 'fulfilled';
    order.failureReason = null;

    world.record('label_agent', 'label_issued', {
      orderId: order.orderId,
      qrId: artifact.qrId,
      labelId: artifact.labelId,
      sha256: artifact.sha256,
      packVersion: artifact.packVersion,
      snapshotHashes: artifact.snapshotHashes,
    });
    world.record('qa_agent', 'label_qa_passed', {
      orderId: order.orderId,
      labelId: artifact.labelId,
      checkedSentenceIds: qa.checkedSentenceIds,
      labelSha256: qa.labelSha256,
    });
    world.store.putOrder(order);
    logEvent('order_fulfilled', {
      orderId: order.orderId,
      labelId: artifact.labelId,
      state: artifact.state,
    });
    return order;
  } catch (e) {
    // The QA gate fails closed. A label that cannot prove its mandated
    // sentences are byte-verbatim does not ship, paid or not.
    order.status = 'failed';
    order.failureReason =
      e instanceof LabelQaError
        ? `label QA gate refused the artifact: ${e.result.failures.map((f) => f.code).join(', ')}`
        : e instanceof LabelComposeError
          ? `label composition refused: ${e.message}`
          : (e as Error).message;
    world.record('qa_agent', 'label_qa_failed', {
      orderId: order.orderId,
      reason: order.failureReason,
      refundDue: true,
    });
    world.store.putOrder(order);
    logEvent('order_failed', { orderId: order.orderId, reason: order.failureReason });
    return order;
  }
}

export function qrIdFor(orderId: string, state: string): string {
  return LabelRegistry.qrIdFor(orderId, state);
}
