import { canonicalHash, canonicalJson } from '../util/canonical';
import { verifyHex } from '../util/keys';
import type { ApprovedAction, EnvelopeAction } from './envelope';

/**
 * Actuator boundary (COMPLEXITY.md §3 / SPONSOR_DEFENSE #5): the ONLY code
 * that touches money or shipped artifacts. Actuators accept ApprovedAction
 * tokens, verify the envelope's Ed25519 signature + action type, and refuse
 * everything else — invariant I5 made structural.
 *
 * This build ships in-memory fakes; production swaps in Stripe + Cloud Tasks
 * implementations behind the SAME interfaces.
 */

export class UnauthorizedActuationError extends Error {
  constructor(msg: string) {
    super(`actuator refused: ${msg}`);
    this.name = 'UnauthorizedActuationError';
  }
}

function verifyApproval<T extends EnvelopeAction['type']>(
  approved: ApprovedAction,
  expectedType: T,
  envelopePublicKeyHex: string,
): asserts approved is ApprovedAction<Extract<EnvelopeAction, { type: T }>> {
  if (approved.action.type !== expectedType) {
    throw new UnauthorizedActuationError(
      `action type "${approved.action.type}" sent to ${expectedType} actuator`,
    );
  }
  if (approved.publicKey !== envelopePublicKeyHex) {
    throw new UnauthorizedActuationError('approval not signed by the policy envelope key');
  }
  const signBody = canonicalJson({
    action: approved.action,
    policyVersion: approved.policyVersion,
    approvalId: approved.approvalId,
    approvedAt: approved.approvedAt,
  });
  if (!verifyHex(approved.publicKey, signBody, approved.signature)) {
    throw new UnauthorizedActuationError('approval signature invalid (tampered or forged)');
  }
}

// ---------------------------------------------------------------------------

export interface RefundReceipt {
  refundId: string;
  customerId: string;
  orderId: string;
  amountUsd: number;
  approvalId: string;
}

export interface StripeActuator {
  refund(approved: ApprovedAction): RefundReceipt;
}

export class FakeStripeActuator implements StripeActuator {
  readonly refunds: RefundReceipt[] = [];
  constructor(private readonly envelopePublicKeyHex: string) {}

  refund(approved: ApprovedAction): RefundReceipt {
    verifyApproval(approved, 'stripe_refund', this.envelopePublicKeyHex);
    const a = approved.action;
    const receipt: RefundReceipt = {
      refundId: `re_fake_${canonicalHash({ a, approvalId: approved.approvalId }).slice(0, 12)}`,
      customerId: a.customerId,
      orderId: a.orderId,
      amountUsd: a.amountUsd,
      approvalId: approved.approvalId,
    };
    this.refunds.push(receipt);
    return receipt;
  }
}

// ---------------------------------------------------------------------------

export interface PriceChangeReceipt {
  priceUsd: number;
  approvalId: string;
}

export interface PricingActuator {
  adoptPrice(approved: ApprovedAction): PriceChangeReceipt;
  readonly currentPriceUsd: number;
}

export class FakePricingActuator implements PricingActuator {
  readonly changes: PriceChangeReceipt[] = [];
  currentPriceUsd: number;
  constructor(
    private readonly envelopePublicKeyHex: string,
    initialPriceUsd: number,
  ) {
    this.currentPriceUsd = initialPriceUsd;
  }

  adoptPrice(approved: ApprovedAction): PriceChangeReceipt {
    verifyApproval(approved, 'adopt_price', this.envelopePublicKeyHex);
    const receipt: PriceChangeReceipt = {
      priceUsd: approved.action.priceUsd,
      approvalId: approved.approvalId,
    };
    this.currentPriceUsd = approved.action.priceUsd;
    this.changes.push(receipt);
    return receipt;
  }
}

// ---------------------------------------------------------------------------

export interface ReissueDispatchReceipt {
  state: string;
  toPackVersion: string;
  qrIds: string[];
  approvalId: string;
}

export interface ReissueActuator {
  dispatch(approved: ApprovedAction): ReissueDispatchReceipt;
}

/** Fake for the Cloud Tasks re-issue fan-out dispatcher. */
export class FakeReissueActuator implements ReissueActuator {
  readonly dispatches: ReissueDispatchReceipt[] = [];
  constructor(private readonly envelopePublicKeyHex: string) {}

  dispatch(approved: ApprovedAction): ReissueDispatchReceipt {
    verifyApproval(approved, 'reissue_labels', this.envelopePublicKeyHex);
    const a = approved.action;
    const receipt: ReissueDispatchReceipt = {
      state: a.state,
      toPackVersion: a.toPackVersion,
      qrIds: [...a.qrIds],
      approvalId: approved.approvalId,
    };
    this.dispatches.push(receipt);
    return receipt;
  }
}
