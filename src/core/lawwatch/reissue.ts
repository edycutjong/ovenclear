import type { RuleEngine } from '../rulekit/engine';
import type { RuleDelta } from '../rulekit/types';
import { issueLabel } from '../label/qa';
import type { LabelArtifact } from '../label/compose';
import type { LabelRegistry } from '../label/registry';
import type { DecisionLedger } from '../ledger/ledger';
import { assertI3, type CustomerRecord, type DeltaImpact } from './impact';

/**
 * Re-issue planner + executor (COMPLEXITY.md §1 "Re-issue Agent").
 *
 * planReissues() turns resolved impacts into an explicit, inspectable plan;
 * executeReissuePlan() re-composes each affected label against the NEW pack
 * version, runs the Label-QA gate (I2 — a re-issue that fails QA aborts that
 * item, never ships), appends registry issue-history, sends notifications via
 * the injected notifier, and ledgers every step (I3/I4).
 */

export interface ReissuePlanItem {
  customerId: string;
  orderId: string;
  qrId: string;
  oldLabelId: string;
  oldSha256: string;
  reasonDeltaId: string;
  reason: string;
}

export interface NotificationItem {
  customerId: string;
  orderId: string;
  type: 'notify' | 'notify_verdict_change';
  reasonDeltaId: string;
  detail: string;
}

export interface ReissuePlan {
  state: string;
  toPackVersion: string;
  items: ReissuePlanItem[];
  notifications: NotificationItem[];
  noneAffectedDeltaIds: string[];
}

export interface Notifier {
  notify(customerId: string, subject: string, body: string): void;
}

/** In-memory notifier fake — records what production would email. */
export class FakeNotifier implements Notifier {
  readonly sent: { customerId: string; subject: string; body: string }[] = [];
  notify(customerId: string, subject: string, body: string): void {
    this.sent.push({ customerId, subject, body });
  }
}

export function planReissues(
  impacts: DeltaImpact[],
  customers: CustomerRecord[],
  toPackVersion: string,
): ReissuePlan {
  assertI3(impacts);
  const byId = new Map(customers.map((c) => [c.id, c]));
  const items: ReissuePlanItem[] = [];
  const notifications: NotificationItem[] = [];
  const noneAffectedDeltaIds: string[] = [];
  const state = impacts[0]?.state ?? 'XX';
  const seenReissue = new Set<string>(); // one re-issue per label per plan

  for (const im of impacts) {
    if (im.classification !== 'material') continue;
    if (im.noneAffected) {
      noneAffectedDeltaIds.push(im.deltaId);
      continue;
    }
    for (const a of im.actions) {
      if (a.type === 'reissue_label') {
        const c = byId.get(a.customerId);
        if (!c?.label || !a.qrId) continue;
        if (seenReissue.has(a.qrId)) continue;
        seenReissue.add(a.qrId);
        items.push({
          customerId: c.id,
          orderId: c.orderId,
          qrId: a.qrId,
          oldLabelId: c.label.labelId,
          oldSha256: c.label.sha256,
          reasonDeltaId: a.reasonDeltaId,
          reason: a.detail,
        });
      } else {
        notifications.push({
          customerId: a.customerId,
          orderId: a.orderId,
          type: a.type,
          reasonDeltaId: a.reasonDeltaId,
          detail: a.detail,
        });
      }
    }
  }
  return { state, toPackVersion, items, notifications, noneAffectedDeltaIds };
}

export interface ReissueExecution {
  reissued: LabelArtifact[];
  notified: number;
  noneAffectedLogged: number;
}

export function executeReissuePlan(opts: {
  plan: ReissuePlan;
  engine: RuleEngine;
  registry: LabelRegistry;
  customers: CustomerRecord[];
  ledger: DecisionLedger;
  notifier: Notifier;
  deltas: RuleDelta[];
  clock: () => string;
}): ReissueExecution {
  const { plan, engine, registry, customers, ledger, notifier, clock } = opts;
  const byId = new Map(customers.map((c) => [c.id, c]));
  const deltaById = new Map(opts.deltas.map((d) => [d.id, d]));
  const spec = engine.labelRequirements(plan.state, plan.toPackVersion);
  const reissued: LabelArtifact[] = [];

  for (const item of plan.items) {
    const c = byId.get(item.customerId);
    if (!c?.label || !c.verdict) {
      throw new Error(`re-issue plan item for ${item.customerId} has no label/verdict`);
    }
    // Re-verdict under the new pack so the label pins current law (same product/venue).
    const freshVerdict = engine.check({
      state: plan.state,
      product: c.verdict.product.input,
      venue: c.verdict.venue,
      packVersion: plan.toPackVersion,
      issuedAt: clock(),
    });
    if (freshVerdict.status === 'prohibited') {
      // The law now prohibits this product — never re-issue; escalate instead.
      notifier.notify(
        c.id,
        `[OvenClear] Important: ${plan.state} rules changed for your product`,
        'Your product is no longer eligible under the amended rule. A human review has been queued (fixture path).',
      );
      ledger.append('reissue_agent', 'reissue_blocked_now_prohibited', {
        customerId: c.id,
        orderId: c.orderId,
        qrId: item.qrId,
        deltaId: item.reasonDeltaId,
        packVersion: plan.toPackVersion,
      });
      continue;
    }
    const { artifact, qa } = issueLabel({
      qrId: item.qrId,
      businessName: c.label.fields.businessName,
      addressLine: c.label.fields.addressLine,
      productName: c.label.fields.productName,
      ingredients: c.label.fields.ingredients,
      ...(c.label.fields.netWeight !== null ? { netWeight: c.label.fields.netWeight } : {}),
      spec,
      verdict: freshVerdict,
      issuedAt: clock(),
      reissueOf: item.oldLabelId,
      reissueReason: item.reason,
    });
    registry.appendIssue(item.qrId, artifact);
    c.label = artifact;
    c.verdict = freshVerdict;
    reissued.push(artifact);
    notifier.notify(
      c.id,
      `[OvenClear] Your ${plan.state} label was re-issued (law change)`,
      `Reason: ${item.reason}\nNew label ${artifact.labelId} (sha256 ${artifact.sha256.slice(0, 12)}…) verified against pack ${plan.toPackVersion}.`,
    );
    ledger.append('reissue_agent', 'label_reissued', {
      customerId: c.id,
      orderId: c.orderId,
      qrId: item.qrId,
      oldLabelId: item.oldLabelId,
      newLabelId: artifact.labelId,
      newSha256: artifact.sha256,
      packVersion: plan.toPackVersion,
      deltaId: item.reasonDeltaId,
      qaPass: qa.pass,
    });
  }

  for (const n of plan.notifications) {
    notifier.notify(n.customerId, `[OvenClear] ${plan.state} cottage-food rules changed`, n.detail);
    ledger.append('reissue_agent', 'notification_sent', {
      customerId: n.customerId,
      orderId: n.orderId,
      type: n.type,
      deltaId: n.reasonDeltaId,
    });
  }

  for (const deltaId of plan.noneAffectedDeltaIds) {
    const d = deltaById.get(deltaId);
    ledger.append('impact_agent', 'material_diff_none_affected', {
      deltaId,
      state: plan.state,
      excerpt: d?.excerpt ?? '(delta not supplied)',
      note: 'material change with zero affected customers — logged per invariant I3',
    });
  }

  return {
    reissued,
    notified: plan.notifications.length,
    noneAffectedLogged: plan.noneAffectedDeltaIds.length,
  };
}
