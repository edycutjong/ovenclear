import type { PolicyEnvelopeDoc } from '../core/envelope/policy';

/**
 * FIXTURE policy envelope (COMPLEXITY.md §3): bounded $19↔$24 pricing A/B
 * with a min-sample rule; refund auto-approval capped at one order's value
 * with an allow-listed reason set; dunning schedule 1/3/7 days then pause.
 */
export const POLICY_FIXTURE: PolicyEnvelopeDoc = {
  policyVersion: 'pol-2026-07-v1',
  fixture: true,
  pricing: {
    experimentId: 'exp_verdict_price_2026w27',
    armsUsd: [19, 24],
    floorUsd: 19,
    capUsd: 24,
    minSamplePerArm: 20,
    metric: 'revenue_per_exposure',
    tieBreak: 'lower_price',
  },
  refunds: {
    maxAutoRefundUsd: 24,
    allowedReasons: ['out_of_coverage', 'duplicate_charge', 'label_qa_unrecoverable'],
    maxAutoRefundsPerCustomerPerMonth: 1,
    dunning: {
      retryScheduleDays: [1, 3, 7],
      onExhaust: 'pause_subscription',
    },
  },
};
