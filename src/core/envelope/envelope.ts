import { canonicalHash, canonicalJson } from '../util/canonical';
import type { AgentKeyring } from '../util/keys';
import type { DecisionLedger } from '../ledger/ledger';
import { validatePolicy, type PolicyEnvelopeDoc } from './policy';
import type { PricingExperiment } from './pricing';

/**
 * PolicyEnvelope — the machine gate between agent proposals and actuators.
 *
 * Every money/artifact action must be converted into an ApprovedAction here.
 * Approvals are Ed25519-signed by the 'policy_envelope' agent; actuators
 * verify that signature and reject anything else (structural I5). Violations
 * are ledgered as `policy_violation_blocked` and thrown.
 */

export const ENVELOPE_AGENT = 'policy_envelope';

export type EnvelopeAction =
  | { type: 'adopt_price'; experimentId: string; priceUsd: number }
  | { type: 'stripe_refund'; customerId: string; orderId: string; amountUsd: number; reason: string }
  | { type: 'reissue_labels'; state: string; toPackVersion: string; qrIds: string[]; reasonDeltaId: string };

export interface ApprovedAction<A extends EnvelopeAction = EnvelopeAction> {
  action: A;
  policyVersion: string;
  approvalId: string;
  approvedAt: string;
  signature: string; // ed25519 over canonical_json({action, policyVersion, approvalId, approvedAt})
  publicKey: string;
}

export class PolicyViolationError extends Error {
  constructor(
    public readonly action: EnvelopeAction,
    public readonly reason: string,
  ) {
    super(`policy envelope BLOCKED ${action.type}: ${reason}`);
    this.name = 'PolicyViolationError';
  }
}

export interface RefundRequest {
  customerId: string;
  orderId: string;
  amountUsd: number;
  reason: string;
  requestedAt: string; // ISO
}

export type RefundDecision =
  | { decision: 'auto_approve'; approved: ApprovedAction<Extract<EnvelopeAction, { type: 'stripe_refund' }>> }
  | { decision: 'escalate_to_human'; reason: string };

export interface DunningPlan {
  customerId: string;
  subscriptionId: string;
  failedAt: string;
  retries: { attempt: number; dueAt: string }[];
  onExhaust: 'pause_subscription';
}

export class PolicyEnvelope {
  private approvalCounter = 0;
  /** customerId → month (YYYY-MM) → auto-refund count */
  private readonly refundCounts = new Map<string, Map<string, number>>();

  constructor(
    public readonly policy: PolicyEnvelopeDoc,
    private readonly keyring: AgentKeyring,
    private readonly ledger: DecisionLedger,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {
    validatePolicy(policy); // an invalid mandate never constructs an envelope
  }

  get publicKeyHex(): string {
    return this.keyring.publicKeyHex(ENVELOPE_AGENT);
  }

  private block(action: EnvelopeAction, reason: string): never {
    this.ledger.append(ENVELOPE_AGENT, 'policy_violation_blocked', { action, reason });
    throw new PolicyViolationError(action, reason);
  }

  private approve<A extends EnvelopeAction>(action: A): ApprovedAction<A> {
    const approvedAt = this.clock();
    const approvalId = `apr_${canonicalHash({ action, approvedAt, n: this.approvalCounter++ }).slice(0, 16)}`;
    const signBody = canonicalJson({
      action,
      policyVersion: this.policy.policyVersion,
      approvalId,
      approvedAt,
    });
    const { signatureHex, publicKeyHex } = this.keyring.sign(ENVELOPE_AGENT, signBody);
    const approved: ApprovedAction<A> = {
      action,
      policyVersion: this.policy.policyVersion,
      approvalId,
      approvedAt,
      signature: signatureHex,
      publicKey: publicKeyHex,
    };
    this.ledger.append(ENVELOPE_AGENT, 'action_approved', {
      approvalId,
      policyVersion: this.policy.policyVersion,
      action,
    });
    return approved;
  }

  /**
   * Gate a pricing adoption: the price must be a policy arm inside the
   * envelope AND the experiment must have reached min sample with this price
   * as its computed winner. No other path can mint an adopt_price approval.
   */
  approvePriceAdoption(
    experiment: PricingExperiment,
    priceUsd: number,
  ): ApprovedAction<Extract<EnvelopeAction, { type: 'adopt_price' }>> {
    const action = {
      type: 'adopt_price' as const,
      experimentId: this.policy.pricing.experimentId,
      priceUsd,
    };
    if (experiment.experimentId !== this.policy.pricing.experimentId) {
      this.block(action, `unknown experiment "${experiment.experimentId}"`);
    }
    if (!this.policy.pricing.armsUsd.includes(priceUsd)) {
      this.block(action, `$${priceUsd} is not a policy arm (${this.policy.pricing.armsUsd.map((a) => `$${a}`).join('/')})`);
    }
    if (priceUsd < this.policy.pricing.floorUsd || priceUsd > this.policy.pricing.capUsd) {
      this.block(action, `$${priceUsd} outside envelope [$${this.policy.pricing.floorUsd}, $${this.policy.pricing.capUsd}]`);
    }
    const proposal = experiment.proposeAdoption();
    if (!proposal.ready) {
      this.block(action, `min sample not reached (need ${this.policy.pricing.minSamplePerArm}/arm; have ${proposal.statsSummary})`);
    }
    if (proposal.winnerUsd !== priceUsd) {
      this.block(action, `proposed $${priceUsd} is not the experiment winner ($${proposal.winnerUsd})`);
    }
    return this.approve(action);
  }

  /** Refund gate: reason allow-list + amount cap + per-customer monthly quota. */
  decideRefund(req: RefundRequest): RefundDecision {
    const action = {
      type: 'stripe_refund' as const,
      customerId: req.customerId,
      orderId: req.orderId,
      amountUsd: req.amountUsd,
      reason: req.reason,
    };
    if (!(req.amountUsd > 0)) {
      this.ledger.append(ENVELOPE_AGENT, 'refund_escalated', { req, reason: 'non-positive amount' });
      return { decision: 'escalate_to_human', reason: 'non-positive amount' };
    }
    if (!this.policy.refunds.allowedReasons.includes(req.reason)) {
      this.ledger.append(ENVELOPE_AGENT, 'refund_escalated', { req, reason: `reason "${req.reason}" not in allow-list` });
      return { decision: 'escalate_to_human', reason: `reason "${req.reason}" not in allow-list` };
    }
    if (req.amountUsd > this.policy.refunds.maxAutoRefundUsd) {
      this.ledger.append(ENVELOPE_AGENT, 'refund_escalated', {
        req,
        reason: `$${req.amountUsd} exceeds auto cap $${this.policy.refunds.maxAutoRefundUsd}`,
      });
      return {
        decision: 'escalate_to_human',
        reason: `$${req.amountUsd} exceeds auto cap $${this.policy.refunds.maxAutoRefundUsd}`,
      };
    }
    const month = req.requestedAt.slice(0, 7);
    const byMonth = this.refundCounts.get(req.customerId) ?? new Map<string, number>();
    const used = byMonth.get(month) ?? 0;
    if (used >= this.policy.refunds.maxAutoRefundsPerCustomerPerMonth) {
      this.ledger.append(ENVELOPE_AGENT, 'refund_escalated', { req, reason: 'per-customer monthly auto-refund quota exhausted' });
      return { decision: 'escalate_to_human', reason: 'per-customer monthly auto-refund quota exhausted' };
    }
    byMonth.set(month, used + 1);
    this.refundCounts.set(req.customerId, byMonth);
    return { decision: 'auto_approve', approved: this.approve(action) };
  }

  /** Re-issue fan-out approval (label actuator requires it). */
  approveReissue(
    state: string,
    toPackVersion: string,
    qrIds: string[],
    reasonDeltaId: string,
  ): ApprovedAction<Extract<EnvelopeAction, { type: 'reissue_labels' }>> {
    const action = { type: 'reissue_labels' as const, state, toPackVersion, qrIds: [...qrIds].sort(), reasonDeltaId };
    if (qrIds.length === 0) this.block(action, 'empty re-issue set — nothing to approve');
    return this.approve(action);
  }

  /** Dunning plan strictly from policy (no agent-invented schedules). */
  planDunning(event: { customerId: string; subscriptionId: string; failedAt: string }): DunningPlan {
    const failed = new Date(event.failedAt);
    if (Number.isNaN(failed.getTime())) throw new Error(`invalid failedAt "${event.failedAt}"`);
    const retries = this.policy.refunds.dunning.retryScheduleDays.map((days, i) => ({
      attempt: i + 1,
      dueAt: new Date(failed.getTime() + days * 86_400_000).toISOString(),
    }));
    const plan: DunningPlan = {
      customerId: event.customerId,
      subscriptionId: event.subscriptionId,
      failedAt: event.failedAt,
      retries,
      onExhaust: this.policy.refunds.dunning.onExhaust,
    };
    this.ledger.append('treasury_agent', 'dunning_planned', plan);
    return plan;
  }
}
