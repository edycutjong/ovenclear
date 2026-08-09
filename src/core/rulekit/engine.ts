import { canonicalHash, must } from '../util/canonical';
import type { SnapshotStore } from '../snapshots/store';
import { normalizeProduct } from './catalog';
import { validatePackGrounding, validateRulepack } from './validate';
import {
  CoverageGapError,
  UnsupportedStateError,
  type CheckInput,
  type ChecklistStep,
  type FeeTable,
  type LabelSpec,
  type ReasonedFinding,
  type ResolvedCitation,
  type Rulepack,
  type Verdict,
  type VerdictStatus,
} from './types';

/**
 * RuleEngine — the `@ovenclear/rulekit` verdict core (COMPLEXITY.md §4).
 *
 * Decision table (documented in README):
 *   1. no registered pack for state          → UnsupportedStateError
 *   2. product not in catalog                → UnknownProductError
 *   3. pack has no rule for product category → CoverageGapError (fails closed)
 *   4. venue policy 'prohibited'             → status 'prohibited' (venue trumps:
 *      even an eligible product cannot be sold at a prohibited venue)
 *   5. else product rule status carries      → eligible | license_required | prohibited
 * Reasons are accumulated for BOTH product and venue findings so a
 * prohibited-product + prohibited-venue case explains both.
 *
 * Invariant I1: every verdict embeds ≥1 snapshot hash; enforced here and
 * re-checked by tests.
 */
export class RuleEngine {
  /** state → packVersion → pack */
  private readonly packs = new Map<string, Map<string, Rulepack>>();

  constructor(private readonly store: SnapshotStore) {}

  /** Validate (schema + grounding) and register a rulepack. */
  register(pack: Rulepack): void {
    validateRulepack(pack);
    validatePackGrounding(pack, this.store);
    let byVersion = this.packs.get(pack.state);
    if (!byVersion) {
      byVersion = new Map();
      this.packs.set(pack.state, byVersion);
    }
    if (byVersion.has(pack.packVersion)) {
      throw new Error(`rulepack ${pack.state}@${pack.packVersion} already registered — packs are immutable`);
    }
    byVersion.set(pack.packVersion, pack);
  }

  states(): string[] {
    return [...this.packs.keys()].sort();
  }

  versions(state: string): string[] {
    return [...(this.packs.get(state)?.keys() ?? [])].sort();
  }

  getPack(state: string, packVersion?: string): Rulepack {
    const byVersion = this.packs.get(state);
    if (!byVersion || byVersion.size === 0) throw new UnsupportedStateError(state);
    if (packVersion) {
      const pack = byVersion.get(packVersion);
      if (!pack) {
        throw new Error(`rulepack ${state}@${packVersion} not registered (have: ${[...byVersion.keys()].join(', ')})`);
      }
      return pack;
    }
    const latest = must([...byVersion.keys()].sort().pop(), 'at least one version exists');
    return must(byVersion.get(latest), 'latest pack exists');
  }

  /** Resolve a pack citation id to a citation with its snapshot hash. */
  private resolveCitations(pack: Rulepack, ids: string[]): ResolvedCitation[] {
    const hashBySnapshotId = new Map(pack.sourceSnapshots.map((s) => [s.snapshotId, s.contentSha256]));
    const byId = new Map(pack.citations.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const out: ResolvedCitation[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const c = must(byId.get(id), `citation "${id}" exists in pack ${pack.state}@${pack.packVersion}`);
      out.push({ ...c, snapshotHash: must(hashBySnapshotId.get(c.snapshotId), `snapshot pin for ${c.snapshotId}`) });
    }
    return out;
  }

  check(input: CheckInput): Verdict {
    const pack = this.getPack(input.state, input.packVersion);
    const product = normalizeProduct(input.product);
    const rule = pack.productRules.find((r) => r.category === product.category);
    if (!rule) throw new CoverageGapError(pack.state, product.category);
    const venuePolicy = pack.program.venues[input.venue];

    const reasons: ReasonedFinding[] = [];
    const citationIds: string[] = [];
    const conditions: string[] = [...(rule.conditions ?? [])];

    // Product finding
    reasons.push({
      kind: 'product',
      message:
        rule.status === 'eligible'
          ? `"${product.canonical}" falls under ${pack.stateName}'s eligible category "${product.category}".`
          : rule.status === 'license_required'
            ? `"${product.canonical}" (category "${product.category}") requires a higher license tier in ${pack.stateName}${rule.note ? ` — ${rule.note}` : ''}.`
            : `"${product.canonical}" (category "${product.category}") may not be sold under ${pack.stateName}'s cottage food program${product.requiresRefrigeration ? ' — it requires refrigeration (potentially hazardous)' : ''}.`,
      citationIds: [...rule.citationIds],
    });
    citationIds.push(...rule.citationIds);

    // Venue finding
    reasons.push({
      kind: 'venue',
      message:
        venuePolicy.policy === 'allowed'
          ? `Venue "${input.venue}" is a permitted sales channel in ${pack.stateName}.`
          : `Venue "${input.venue}" is prohibited for cottage food sales in ${pack.stateName}.`,
      citationIds: [venuePolicy.citationId],
    });
    citationIds.push(venuePolicy.citationId);

    // Status resolution: venue prohibition trumps everything.
    let status: VerdictStatus;
    if (venuePolicy.policy === 'prohibited') status = 'prohibited';
    else status = rule.status;

    // License / cap findings for context
    if (status !== 'prohibited' && pack.program.licenseRequiredForBaseline && pack.program.baselineLicense) {
      reasons.push({
        kind: 'license',
        message: `${pack.program.baselineLicense.name} required ($${pack.program.baselineLicense.annualFeeUsd}/yr).`,
        citationIds: [pack.program.baselineLicense.citationId],
      });
      citationIds.push(pack.program.baselineLicense.citationId);
    }
    if (status !== 'prohibited' && pack.program.annualRevenueCapUsd !== null && pack.program.capCitationId) {
      reasons.push({
        kind: 'cap',
        message: `Annual gross sales cap: $${pack.program.annualRevenueCapUsd.toLocaleString('en-US')}.`,
        citationIds: [pack.program.capCitationId],
      });
      citationIds.push(pack.program.capCitationId);
    }
    if (pack.depth === 'stub') {
      reasons.push({
        kind: 'coverage',
        message: `${pack.stateName} coverage is stub-depth in this build — production routes this state to made-to-order research with human spot-check.`,
        citationIds: [],
      });
    }

    const citations = this.resolveCitations(pack, citationIds);
    const snapshotHashes = [...new Set(pack.sourceSnapshots.map((s) => s.contentSha256))].sort();
    if (snapshotHashes.length === 0) {
      // unreachable given validation, but I1 is enforced at issue time too
      throw new Error('invariant I1 violated: verdict would have no snapshot hashes');
    }

    const checklist = this.buildChecklist(pack, status);
    const fees = this.feesForPack(pack);
    const issuedAt = input.issuedAt ?? new Date().toISOString();

    const core = {
      state: pack.state,
      packVersion: pack.packVersion,
      packDepth: pack.depth,
      product: { input: input.product, canonical: product.canonical, category: product.category },
      venue: input.venue,
      status,
      reasons,
      conditions,
      citations,
      snapshotHashes,
      checklist,
      fees,
      annualRevenueCapUsd: pack.program.annualRevenueCapUsd,
    };
    const verdictHash = canonicalHash(core);

    return { ...core, issuedAt, verdictHash, fixture: true };
  }

  private buildChecklist(pack: Rulepack, status: VerdictStatus): ChecklistStep[] {
    const feeById = new Map(pack.fees.map((f) => [f.id, f]));
    return pack.checklists[status].map((tpl, i) => {
      const step: ChecklistStep = { step: i + 1, text: tpl.text };
      if (tpl.citationId) step.citationId = tpl.citationId;
      if (tpl.feeId) step.feeUsd = must(feeById.get(tpl.feeId), `fee ${tpl.feeId}`).amountUsd;
      return step;
    });
  }

  labelRequirements(state: string, packVersion?: string): LabelSpec {
    const pack = this.getPack(state, packVersion);
    return {
      ...pack.labelSpec,
      mandatedSentences: pack.labelSpec.mandatedSentences.map((m) => ({ ...m })),
      requiredFields: [...pack.labelSpec.requiredFields],
      state: pack.state,
      packVersion: pack.packVersion,
      snapshotHashes: [...new Set(pack.sourceSnapshots.map((s) => s.contentSha256))].sort(),
      fixture: true,
    };
  }

  feesFor(state: string, packVersion?: string): FeeTable {
    return this.feesForPack(this.getPack(state, packVersion));
  }

  private feesForPack(pack: Rulepack): FeeTable {
    return {
      state: pack.state,
      packVersion: pack.packVersion,
      items: pack.fees.map((f) => ({ ...f })),
      annualRevenueCapUsd: pack.program.annualRevenueCapUsd,
      snapshotHashes: [...new Set(pack.sourceSnapshots.map((s) => s.contentSha256))].sort(),
      fixture: true,
    };
  }
}
