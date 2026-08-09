import { SnapshotStore } from '../core/snapshots/store';
import { RuleEngine } from '../core/rulekit/engine';
import { diffSnapshots } from '../core/rulekit/diff';
import type { RuleDelta, Rulepack } from '../core/rulekit/types';
import { issueLabel } from '../core/label/qa';
import { LabelRegistry } from '../core/label/registry';
import { DecisionLedger } from '../core/ledger/ledger';
import { AgentKeyring } from '../core/util/keys';
import { PolicyEnvelope } from '../core/envelope/envelope';
import { PricingExperiment } from '../core/envelope/pricing';
import {
  FakePricingActuator,
  FakeReissueActuator,
  FakeStripeActuator,
} from '../core/envelope/actuators';
import { normalizeInterview } from '../core/intake/interview';
import { resolveImpact, assertI3, type CustomerRecord, type DeltaImpact } from '../core/lawwatch/impact';
import {
  executeReissuePlan,
  FakeNotifier,
  planReissues,
  type ReissueExecution,
  type ReissuePlan,
} from '../core/lawwatch/reissue';
import type { GeminiAdapter, MaterialityResult } from '../core/lawwatch/adapter';
import { registerFixtureSnapshots, type FixtureSnapshots } from './snapshots';
import { buildGaPack } from './rulepacks/ga';
import { buildTxPack } from './rulepacks/tx';
import { buildCaStubPack, buildFlStubPack } from './rulepacks/stubs';
import { CUSTOMER_FIXTURES } from './customers';
import { POLICY_FIXTURE } from './policy';

/**
 * buildWorld() — one deterministic in-memory assembly of the whole offline
 * core, shared by seed.ts, self_test.ts, bench.ts and the integration tests.
 *
 * With the default FixtureClock and the deterministic keyring, every hash,
 * signature, label and ledger row is byte-stable across runs (the property
 * `seed --check` asserts).
 */

/** Deterministic stepping clock: start + 1s per call. */
export class FixtureClock {
  private t: number;
  constructor(startIso = '2026-07-04T09:00:00.000Z') {
    this.t = Date.parse(startIso);
    if (Number.isNaN(this.t)) throw new Error(`bad clock start "${startIso}"`);
  }
  next = (): string => {
    const iso = new Date(this.t).toISOString();
    this.t += 1000;
    return iso;
  };
}

/** Pack versions customers bought under (TX cohort pre-dates the amendment). */
const CUSTOMER_PACK_VERSION: Record<string, string> = {
  GA: '2026-07',
  TX: '2026-06',
};

export interface World {
  clock: () => string;
  keyring: AgentKeyring;
  store: SnapshotStore;
  snapshots: FixtureSnapshots;
  engine: RuleEngine;
  ledger: DecisionLedger;
  registry: LabelRegistry;
  notifier: FakeNotifier;
  envelope: PolicyEnvelope;
  experiment: PricingExperiment;
  stripeActuator: FakeStripeActuator;
  pricingActuator: FakePricingActuator;
  reissueActuator: FakeReissueActuator;
  customers: CustomerRecord[];
  txPackAfter: Rulepack; // built (and grounded) but only registered by the replay
}

export interface BuildWorldOptions {
  clock?: () => string;
  /** Register TX@2026-07 up-front (golden suite needs it pinned). */
  includeAmendedTx?: boolean;
}

export function buildWorld(opts: BuildWorldOptions = {}): World {
  const clock = opts.clock ?? new FixtureClock().next;
  const keyring = AgentKeyring.deterministic();
  const ledger = new DecisionLedger(keyring, clock);
  const store = new SnapshotStore();
  const snapshots = registerFixtureSnapshots(store);
  for (const snap of [snapshots.ga, snapshots.txBefore, snapshots.txAfter, snapshots.ca, snapshots.fl]) {
    ledger.append('lawwatch_agent', 'snapshot_fetched', {
      snapshotId: snap.id,
      state: snap.state,
      url: snap.url,
      contentSha256: snap.contentSha256,
      fetchedAt: snap.fetchedAt,
      fixture: true,
    });
  }

  const engine = new RuleEngine(store);
  engine.register(buildGaPack(snapshots.ga));
  engine.register(buildTxPack(snapshots.txBefore, '2026-06'));
  engine.register(buildCaStubPack(snapshots.ca));
  engine.register(buildFlStubPack(snapshots.fl));
  const txPackAfter = buildTxPack(snapshots.txAfter, '2026-07');
  if (opts.includeAmendedTx) engine.register(txPackAfter);

  const registry = new LabelRegistry();
  const notifier = new FakeNotifier();
  const envelope = new PolicyEnvelope(POLICY_FIXTURE, keyring, ledger, clock);
  const experiment = new PricingExperiment(POLICY_FIXTURE.pricing);
  const stripeActuator = new FakeStripeActuator(envelope.publicKeyHex);
  const pricingActuator = new FakePricingActuator(envelope.publicKeyHex, POLICY_FIXTURE.pricing.floorUsd);
  const reissueActuator = new FakeReissueActuator(envelope.publicKeyHex);

  // --- customers: interview → verdict → (label + QA) — all ledgered ---
  const customers: CustomerRecord[] = [];
  for (const f of CUSTOMER_FIXTURES) {
    const normalized = normalizeInterview(
      {
        state: f.state,
        productDescription: f.product,
        venue: f.venue,
        businessName: f.businessName,
        city: f.city,
        ingredients: f.ingredients,
        contactEmail: f.email,
      },
      engine,
    );
    const packVersion = CUSTOMER_PACK_VERSION[f.state];
    const verdict = engine.check({
      state: normalized.state,
      product: normalized.productInput,
      venue: normalized.venue,
      ...(packVersion ? { packVersion } : {}),
      issuedAt: clock(),
    });
    const orderId = `ord_${f.id}`;
    ledger.append('verdict_agent', 'verdict_issued', {
      customerId: f.id,
      orderId,
      state: verdict.state,
      packVersion: verdict.packVersion,
      product: verdict.product.canonical,
      venue: verdict.venue,
      status: verdict.status,
      verdictHash: verdict.verdictHash,
      snapshotHashes: verdict.snapshotHashes,
    });

    const record: CustomerRecord = {
      id: f.id,
      name: f.name,
      businessName: f.businessName,
      state: f.state,
      email: f.email,
      product: f.product,
      venue: f.venue,
      lawWatch: f.lawWatch,
      orderId,
      verdict,
      fixture: true,
    };

    if (f.wantsLabel) {
      if (verdict.status === 'prohibited') {
        ledger.append('label_agent', 'label_refused_prohibited', {
          customerId: f.id,
          orderId,
          state: verdict.state,
          product: verdict.product.canonical,
          verdictHash: verdict.verdictHash,
          note: 'no label for a prohibited verdict — the refusal is the product working',
        });
      } else {
        const entry = registry.create(orderId, f.id, f.state);
        const spec = engine.labelRequirements(f.state, verdict.packVersion);
        const { artifact, qa } = issueLabel({
          qrId: entry.qrId,
          businessName: f.businessName,
          addressLine: f.city,
          productName: normalized.canonicalProduct,
          ingredients: f.ingredients,
          ...(f.netWeight ? { netWeight: f.netWeight } : {}),
          spec,
          verdict,
          issuedAt: clock(),
        });
        registry.appendIssue(entry.qrId, artifact);
        record.label = artifact;
        ledger.append('label_agent', 'label_issued', {
          customerId: f.id,
          orderId,
          qrId: artifact.qrId,
          labelId: artifact.labelId,
          sha256: artifact.sha256,
          packVersion: artifact.packVersion,
          snapshotHashes: artifact.snapshotHashes,
        });
        ledger.append('qa_agent', 'label_qa_passed', {
          customerId: f.id,
          labelId: artifact.labelId,
          checkedSentenceIds: qa.checkedSentenceIds,
          labelSha256: qa.labelSha256,
        });
      }
    }
    customers.push(record);
  }

  return {
    clock,
    keyring,
    store,
    snapshots,
    engine,
    ledger,
    registry,
    notifier,
    envelope,
    experiment,
    stripeActuator,
    pricingActuator,
    reissueActuator,
    customers,
    txPackAfter,
  };
}

export interface TxReplayResult {
  deltas: RuleDelta[];
  results: MaterialityResult[];
  impacts: DeltaImpact[];
  plan: ReissuePlan;
  execution: ReissueExecution;
}

/**
 * The replayed historical TX rule change (SEED_DATA.md "change-detection
 * moment"): diff → classification → impact → envelope-approved re-issue
 * fan-out, everything ledgered. HONESTY: this is a replayed FIXTURE
 * amendment, and every ledger row it produces says so.
 */
export async function runTxAmendmentReplay(world: World, adapter: GeminiAdapter): Promise<TxReplayResult> {
  const { snapshots, ledger, engine, customers, registry, notifier, envelope, clock } = world;

  const deltas = diffSnapshots(snapshots.txBefore, snapshots.txAfter);
  ledger.append('lawwatch_agent', 'diff_computed', {
    state: 'TX',
    fromSnapshot: snapshots.txBefore.id,
    fromHash: snapshots.txBefore.contentSha256,
    toSnapshot: snapshots.txAfter.id,
    toHash: snapshots.txAfter.contentSha256,
    deltaCount: deltas.length,
    replayedHistoricalFixture: true,
  });

  const results = await adapter.classifyMateriality({ state: 'TX', deltas });
  const deltaById = new Map(deltas.map((d) => [d.id, d]));
  for (const r of results) {
    const d = deltaById.get(r.deltaId);
    ledger.append('lawwatch_agent', 'diff_classified', {
      deltaId: r.deltaId,
      state: 'TX',
      section: d?.section ?? '(unknown)',
      kind: d?.kind ?? '(unknown)',
      classification: r.classification,
      scope: r.scope,
      rationale: r.rationale,
      affectedCategories: r.affectedCategories,
      excerpt: d?.excerpt ?? '',
      adapter: adapter.name,
    });
  }

  const impacts = resolveImpact({ state: 'TX', deltas, results, customers });
  assertI3(impacts);
  for (const im of impacts) {
    if (im.classification !== 'material') continue;
    ledger.append('impact_agent', 'impact_resolved', {
      deltaId: im.deltaId,
      state: im.state,
      scope: im.scope,
      affectedCustomers: im.affectedCustomerIds.length,
      actions: im.actions.length,
      noneAffected: im.noneAffected,
    });
  }

  if (!engine.versions('TX').includes('2026-07')) {
    engine.register(world.txPackAfter);
    ledger.append('lawwatch_agent', 'rulepack_registered', {
      state: 'TX',
      packVersion: '2026-07',
      sourceSnapshots: world.txPackAfter.sourceSnapshots,
      replayedHistoricalFixture: true,
    });
  }

  const plan = planReissues(impacts, customers, '2026-07');
  if (plan.items.length > 0) {
    const approved = envelope.approveReissue(
      'TX',
      '2026-07',
      plan.items.map((i) => i.qrId),
      plan.items[0]!.reasonDeltaId,
    );
    world.reissueActuator.dispatch(approved);
  }
  const execution = executeReissuePlan({
    plan,
    engine,
    registry,
    customers,
    ledger,
    notifier,
    deltas,
    clock,
  });

  return { deltas, results, impacts, plan, execution };
}
