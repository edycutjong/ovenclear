import { SnapshotStore } from '../src/core/snapshots/store';
import { RuleEngine } from '../src/core/rulekit/engine';
import { LabelRegistry } from '../src/core/label/registry';
import { DecisionLedger, type LedgerEntry } from '../src/core/ledger/ledger';
import { AgentKeyring } from '../src/core/util/keys';
import { DeterministicMockAdapter, type GeminiAdapter } from '../src/core/lawwatch/adapter';
import { createGeminiAdapter } from '../src/core/lawwatch/gemini';
import { registerFixtureSnapshots, type FixtureSnapshots } from '../src/fixtures/snapshots';
import { buildGaPack } from '../src/fixtures/rulepacks/ga';
import { buildTxPack } from '../src/fixtures/rulepacks/tx';
import { buildCaStubPack, buildFlStubPack } from '../src/fixtures/rulepacks/stubs';
import type { Config } from './config';
import { Store, logEvent } from './store';

/**
 * The production assembly.
 *
 * This is `buildWorld()`'s sibling for the deployed service, and it differs in
 * exactly three ways: a real wall clock instead of the FixtureClock, a ledger
 * rehydrated from durable storage instead of a fresh in-memory one, and NO
 * seeded fixture customers — every row in the production ledger is a real
 * request from a real visitor.
 *
 * What does NOT change: the rulepacks are still FIXTURE / synthetic
 * statute-shaped data. The engine refuses to register a non-fixture pack, and
 * the site says so on every page. Widening to verbatim law is a licensing and
 * sourcing problem, not a code problem, and pretending otherwise would make
 * this a compliance product that lies.
 */

export interface ProdWorld {
  clock: () => string;
  keyring: AgentKeyring;
  snapshotStore: SnapshotStore;
  snapshots: FixtureSnapshots;
  engine: RuleEngine;
  registry: LabelRegistry;
  ledger: DecisionLedger;
  store: Store;
  /** Live Gemini when a key is present; the deterministic mock otherwise. */
  classifier: GeminiAdapter;
  geminiLive: boolean;
  /** Append to the ledger AND persist the row. Always use this, not ledger.append. */
  record: (agent: string, kind: string, payload: unknown) => LedgerEntry;
}

export async function buildProductionWorld(cfg: Config): Promise<ProdWorld> {
  const clock = (): string => new Date().toISOString();
  const keyring = AgentKeyring.deterministic(cfg.ledgerKeyNamespace);
  const store = Store.open(cfg.dataDir);

  const snapshotStore = new SnapshotStore();
  const snapshots = registerFixtureSnapshots(snapshotStore);

  const engine = new RuleEngine(snapshotStore);
  engine.register(buildGaPack(snapshots.ga));
  engine.register(buildTxPack(snapshots.txBefore, '2026-06'));
  engine.register(buildTxPack(snapshots.txAfter, '2026-07'));
  engine.register(buildCaStubPack(snapshots.ca));
  engine.register(buildFlStubPack(snapshots.fl));

  const registry = new LabelRegistry();

  // Rehydrate the signed chain so restarts do not fork the ledger.
  const existing = store.loadLedger();
  let ledger: DecisionLedger;
  if (existing.length > 0) {
    ledger = DecisionLedger.restore(existing, keyring, clock);
    logEvent('ledger_restored', { rows: existing.length, lastHash: ledger.lastHash });
  } else {
    ledger = new DecisionLedger(keyring, clock);
  }

  const record = (agent: string, kind: string, payload: unknown): LedgerEntry => {
    const entry = ledger.append(agent, kind, payload);
    store.appendLedger(entry);
    return entry;
  };

  // Genesis: pin the law snapshots this instance is serving verdicts from.
  if (existing.length === 0) {
    for (const snap of [snapshots.ga, snapshots.txBefore, snapshots.txAfter, snapshots.ca, snapshots.fl]) {
      record('lawwatch_agent', 'snapshot_fetched', {
        snapshotId: snap.id,
        state: snap.state,
        url: snap.url,
        contentSha256: snap.contentSha256,
        fetchedAt: snap.fetchedAt,
        fixture: true,
      });
    }
  }

  // Rebuild the label registry from the ledger so QR provenance survives a
  // restart. Labels are re-derived from their issue rows, not recomposed.
  rebuildRegistry(registry, ledger.all(), store);

  let classifier: GeminiAdapter = new DeterministicMockAdapter();
  let geminiLive = false;
  if (cfg.geminiApiKey) {
    try {
      classifier = await createGeminiAdapter();
      geminiLive = true;
      logEvent('gemini_adapter_ready', { adapter: classifier.name });
    } catch (e) {
      // Fail loudly but keep serving verdicts — the deterministic core does
      // not need Gemini, and refusing to boot would take the store offline.
      logEvent('gemini_adapter_failed', { error: (e as Error).message });
    }
  }

  return {
    clock,
    keyring,
    snapshotStore,
    snapshots,
    engine,
    registry,
    ledger,
    store,
    classifier,
    geminiLive,
    record,
  };
}

/** Restore `labels/{qrId}` issue history from the persisted ledger rows. */
function rebuildRegistry(registry: LabelRegistry, entries: readonly LedgerEntry[], store: Store): void {
  const orderById = new Map(store.allOrders().map((o) => [o.orderId, o]));
  for (const e of entries) {
    if (e.kind !== 'label_issued') continue;
    const p = e.payload as { orderId?: string; customerId?: string; qrId?: string };
    if (!p.orderId || !p.qrId) continue;
    const order = orderById.get(p.orderId);
    if (!order?.label) continue;
    const entryRec = registry.create(p.orderId, p.customerId ?? p.orderId, order.label.state);
    if (entryRec.issueHistory.length === 0) registry.appendIssue(entryRec.qrId, order.label);
  }
}
