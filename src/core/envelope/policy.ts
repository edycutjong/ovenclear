/**
 * Policy envelope document + machine validation (invariant I5: pricing and
 * refund actions only inside the policy envelope).
 *
 * The policy is DATA, validated before any engine will accept it — an agent
 * cannot "reinterpret" its mandate because the mandate is a checked object,
 * not prose.
 */

export interface PricingPolicy {
  experimentId: string;
  /** The only prices the pricing agent may ever set. */
  armsUsd: number[];
  floorUsd: number;
  capUsd: number;
  /** Minimum exposures per arm before adoption may even be proposed. */
  minSamplePerArm: number;
  metric: 'revenue_per_exposure';
  /** Tie-break: adopt the LOWER price (customer-favorable). */
  tieBreak: 'lower_price';
}

export interface RefundPolicy {
  maxAutoRefundUsd: number;
  allowedReasons: string[];
  maxAutoRefundsPerCustomerPerMonth: number;
  dunning: {
    /** Days after failure for each retry attempt, strictly increasing. */
    retryScheduleDays: number[];
    onExhaust: 'pause_subscription';
  };
}

export interface PolicyEnvelopeDoc {
  policyVersion: string;
  fixture: true;
  pricing: PricingPolicy;
  refunds: RefundPolicy;
}

export class PolicyValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`policy envelope invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'PolicyValidationError';
  }
}

export function validatePolicy(doc: PolicyEnvelopeDoc): void {
  const problems: string[] = [];
  if (!doc.policyVersion?.trim()) problems.push('policyVersion required');
  if (doc.fixture !== true) problems.push('fixture must be true in this build');

  const p = doc.pricing;
  if (!p) {
    problems.push('pricing policy required');
  } else {
    if (!p.experimentId?.trim()) problems.push('pricing.experimentId required');
    if (!Array.isArray(p.armsUsd) || p.armsUsd.length < 2) {
      problems.push('pricing.armsUsd must have >= 2 arms');
    }
    if (!(p.floorUsd > 0)) problems.push('pricing.floorUsd must be > 0');
    if (!(p.capUsd >= p.floorUsd)) problems.push('pricing.capUsd must be >= floorUsd');
    for (const arm of p.armsUsd ?? []) {
      if (!(arm >= p.floorUsd && arm <= p.capUsd)) {
        problems.push(`pricing arm $${arm} outside envelope [$${p.floorUsd}, $${p.capUsd}]`);
      }
    }
    if (new Set(p.armsUsd ?? []).size !== (p.armsUsd ?? []).length) {
      problems.push('pricing.armsUsd must be distinct');
    }
    if (!(Number.isInteger(p.minSamplePerArm) && p.minSamplePerArm >= 1)) {
      problems.push('pricing.minSamplePerArm must be an integer >= 1');
    }
    if (p.metric !== 'revenue_per_exposure') problems.push('pricing.metric must be revenue_per_exposure');
    if (p.tieBreak !== 'lower_price') problems.push('pricing.tieBreak must be lower_price');
  }

  const r = doc.refunds;
  if (!r) {
    problems.push('refunds policy required');
  } else {
    if (!(r.maxAutoRefundUsd > 0)) problems.push('refunds.maxAutoRefundUsd must be > 0');
    if (!r.allowedReasons?.length) problems.push('refunds.allowedReasons must be non-empty');
    if (!(Number.isInteger(r.maxAutoRefundsPerCustomerPerMonth) && r.maxAutoRefundsPerCustomerPerMonth >= 1)) {
      problems.push('refunds.maxAutoRefundsPerCustomerPerMonth must be an integer >= 1');
    }
    const sched = r.dunning?.retryScheduleDays ?? [];
    if (!sched.length) problems.push('refunds.dunning.retryScheduleDays must be non-empty');
    for (let i = 0; i < sched.length; i++) {
      if (!(sched[i]! > 0)) problems.push(`dunning retry day[${i}] must be > 0`);
      if (i > 0 && !(sched[i]! > sched[i - 1]!)) problems.push('dunning retrySchedule must be strictly increasing');
    }
    if (r.dunning?.onExhaust !== 'pause_subscription') {
      problems.push('refunds.dunning.onExhaust must be pause_subscription');
    }
  }

  if (problems.length) throw new PolicyValidationError(problems);
}
