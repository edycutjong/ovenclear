import type { PricingPolicy } from './policy';

/**
 * Bounded pricing A/B experiment ($19↔$24, COMPLEXITY.md §3).
 *
 * The experiment only ACCUMULATES evidence and PROPOSES; adoption authority
 * lives exclusively in PolicyEnvelope.approvePriceAdoption(). Metric:
 * revenue-per-exposure (armUsd × conversions ÷ exposures); ties adopt the
 * lower price (customer-favorable, policy-pinned).
 */

export interface ArmStats {
  armUsd: number;
  exposures: number;
  conversions: number;
  revenueUsd: number;
  revenuePerExposure: number;
}

export interface AdoptionProposal {
  ready: boolean;
  winnerUsd: number | null;
  arms: ArmStats[];
  statsSummary: string;
}

export class PricingExperiment {
  private readonly exposures = new Map<number, number>();
  private readonly conversions = new Map<number, number>();
  adoptedPriceUsd: number | null = null;

  constructor(private readonly policy: PricingPolicy) {
    for (const arm of policy.armsUsd) {
      this.exposures.set(arm, 0);
      this.conversions.set(arm, 0);
    }
  }

  get experimentId(): string {
    return this.policy.experimentId;
  }

  /** Deterministic arm assignment (hash-free round robin by visitor ordinal). */
  armForVisitor(visitorOrdinal: number): number {
    const arms = [...this.policy.armsUsd].sort((a, b) => a - b);
    return arms[visitorOrdinal % arms.length]!;
  }

  record(sample: { armUsd: number; converted: boolean }): void {
    if (!this.exposures.has(sample.armUsd)) {
      throw new Error(`arm $${sample.armUsd} is not part of experiment ${this.experimentId}`);
    }
    this.exposures.set(sample.armUsd, this.exposures.get(sample.armUsd)! + 1);
    if (sample.converted) {
      this.conversions.set(sample.armUsd, this.conversions.get(sample.armUsd)! + 1);
    }
  }

  stats(): ArmStats[] {
    return [...this.policy.armsUsd]
      .sort((a, b) => a - b)
      .map((arm) => {
        const exposures = this.exposures.get(arm)!;
        const conversions = this.conversions.get(arm)!;
        const revenueUsd = conversions * arm;
        return {
          armUsd: arm,
          exposures,
          conversions,
          revenueUsd,
          revenuePerExposure: exposures === 0 ? 0 : revenueUsd / exposures,
        };
      });
  }

  proposeAdoption(): AdoptionProposal {
    const arms = this.stats();
    const statsSummary = arms.map((a) => `$${a.armUsd}: ${a.conversions}/${a.exposures}`).join(', ');
    const ready = arms.every((a) => a.exposures >= this.policy.minSamplePerArm);
    if (!ready) return { ready: false, winnerUsd: null, arms, statsSummary };
    let winner = arms[0]!;
    for (const a of arms.slice(1)) {
      if (
        a.revenuePerExposure > winner.revenuePerExposure ||
        (a.revenuePerExposure === winner.revenuePerExposure && a.armUsd < winner.armUsd) // tieBreak lower_price
      ) {
        winner = a;
      }
    }
    return { ready: true, winnerUsd: winner.armUsd, arms, statsSummary };
  }
}
