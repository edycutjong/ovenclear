import type { RuleDelta, VenueCode, Verdict } from '../rulekit/types';
import type { LabelArtifact } from '../label/compose';
import type { MaterialityResult } from './adapter';

/**
 * Impact resolver — which customers / artifacts does a material change touch?
 * (COMPLEXITY.md §1 "Impact Resolver"; invariant I3: every material diff
 * resolves to explicit customer actions or a logged "none affected".)
 *
 * Business rules (PRD §5 / Law-Watch):
 *  - label_text scope   → every customer in the state holding an issued label:
 *      · Law-Watch subscribers → reissue_label (autonomous)
 *      · non-subscribers       → notify (courtesy + upgrade offer; re-issue is
 *        the subscription's substance)
 *  - eligibility scope  → customers in the state whose verdict category is in
 *    affectedCategories (all state customers when the classifier gave none)
 *      → notify_verdict_change
 *  - fees/venue/license → all customers in the state with a verdict (their
 *    checklists cite the changed duty) → notify_verdict_change
 *  - immaterial/cosmetic → no actions (ledgered as classified only)
 */

export interface CustomerRecord {
  id: string;
  name: string;
  businessName: string;
  state: string;
  email: string; // FIXTURE contact
  product: string;
  venue: VenueCode;
  lawWatch: boolean; // $5/mo Law-Watch subscriber
  orderId: string;
  verdict?: Verdict;
  label?: LabelArtifact;
  fixture: true;
}

export type ImpactActionType = 'reissue_label' | 'notify' | 'notify_verdict_change';

export interface ImpactAction {
  type: ImpactActionType;
  customerId: string;
  orderId: string;
  qrId: string | null;
  reasonDeltaId: string;
  detail: string;
}

export interface DeltaImpact {
  deltaId: string;
  state: string;
  classification: MaterialityResult['classification'];
  scope: MaterialityResult['scope'];
  affectedCustomerIds: string[];
  actions: ImpactAction[];
  /** true ⇒ material delta with zero affected customers (must be ledgered). */
  noneAffected: boolean;
}

export interface ImpactInput {
  state: string;
  deltas: RuleDelta[];
  results: MaterialityResult[];
  customers: CustomerRecord[];
}

export class ImpactResolutionError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ImpactResolutionError';
  }
}

export function resolveImpact(input: ImpactInput): DeltaImpact[] {
  const deltaById = new Map(input.deltas.map((d) => [d.id, d]));
  const inState = input.customers
    .filter((c) => c.state === input.state)
    .sort((a, b) => a.id.localeCompare(b.id));

  const impacts: DeltaImpact[] = [];
  for (const r of input.results) {
    const delta = deltaById.get(r.deltaId);
    if (!delta) throw new ImpactResolutionError(`classification for unknown delta "${r.deltaId}"`);

    if (r.classification !== 'material') {
      impacts.push({
        deltaId: r.deltaId,
        state: input.state,
        classification: r.classification,
        scope: r.scope,
        affectedCustomerIds: [],
        actions: [],
        noneAffected: false, // not material → I3 does not demand an action/log
      });
      continue;
    }

    const actions: ImpactAction[] = [];
    if (r.scope === 'label_text') {
      for (const c of inState) {
        if (!c.label) continue;
        actions.push({
          type: c.lawWatch ? 'reissue_label' : 'notify',
          customerId: c.id,
          orderId: c.orderId,
          qrId: c.label.qrId,
          reasonDeltaId: r.deltaId,
          detail: c.lawWatch
            ? `mandated label wording changed — automatic re-issue (Law-Watch): ${delta.excerpt.split('\n')[0] ?? ''}`
            : 'mandated label wording changed — your label is stale; Law-Watch re-issues automatically',
        });
      }
    } else if (r.scope === 'eligibility') {
      for (const c of inState) {
        if (!c.verdict) continue;
        const matches =
          r.affectedCategories.length === 0 ||
          r.affectedCategories.includes(c.verdict.product.category);
        if (!matches) continue;
        actions.push({
          type: 'notify_verdict_change',
          customerId: c.id,
          orderId: c.orderId,
          qrId: c.label?.qrId ?? null,
          reasonDeltaId: r.deltaId,
          detail: `eligibility rules changed for category "${c.verdict.product.category}" — verdict refresh recommended`,
        });
      }
    } else {
      // fees / venue / license (admin+formatting can't be material by construction,
      // but a material classification on them still fans out conservatively)
      for (const c of inState) {
        if (!c.verdict) continue;
        actions.push({
          type: 'notify_verdict_change',
          customerId: c.id,
          orderId: c.orderId,
          qrId: c.label?.qrId ?? null,
          reasonDeltaId: r.deltaId,
          detail: `${r.scope} duties changed — checklist refresh recommended`,
        });
      }
    }

    impacts.push({
      deltaId: r.deltaId,
      state: input.state,
      classification: r.classification,
      scope: r.scope,
      affectedCustomerIds: [...new Set(actions.map((a) => a.customerId))],
      actions,
      noneAffected: actions.length === 0,
    });
  }
  return impacts;
}

/**
 * Invariant I3 checker: every material delta must either carry explicit
 * customer actions or be flagged noneAffected (which callers must ledger).
 */
export function assertI3(impacts: DeltaImpact[]): void {
  for (const im of impacts) {
    if (im.classification !== 'material') continue;
    const hasActions = im.actions.length > 0;
    if (hasActions === im.noneAffected) {
      throw new ImpactResolutionError(
        `I3 violated for delta ${im.deltaId}: material diff must resolve to actions XOR a "none affected" log`,
      );
    }
  }
}
