import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { LedgerEntry } from '../src/core/ledger/ledger';
import type { LabelArtifact } from '../src/core/label/compose';
import type { Verdict } from '../src/core/rulekit/types';

/**
 * Durable state for the storefront.
 *
 * Deliberately a plain append-only file store rather than a database client:
 * on Cloud Run the durability comes from mounting a GCS bucket at DATA_DIR
 * (see DEPLOY.md), which keeps this code testable on a laptop with no
 * emulator and no credentials. The ledger is the audit surface; `orders.jsonl`
 * is the operational surface.
 *
 * Every write is also emitted to stdout as structured JSON so Cloud Logging
 * retains an independent copy — that log IS the "agent execution records"
 * evidence the rules ask for.
 */

export type OrderStatus = 'pending_payment' | 'paid' | 'fulfilled' | 'refused' | 'failed';

export interface OrderIntake {
  state: string;
  productDescription: string;
  venue: string;
  businessName: string;
  city: string;
  ingredients: string[];
  contactEmail: string;
  netWeight?: string;
}

export interface Order {
  orderId: string;
  /** Unguessable delivery token — the customer's link to their artifact. */
  token: string;
  status: OrderStatus;
  amountUsd: number;
  intake: OrderIntake;
  createdAt: string;
  updatedAt: string;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  /** Populated at fulfillment. */
  verdict: Verdict | null;
  label: LabelArtifact | null;
  qrId: string | null;
  failureReason: string | null;
}

export interface StoreSnapshot {
  orders: Order[];
  ledger: LedgerEntry[];
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Structured stdout log — one JSON object per line, Cloud Logging friendly.
 * Silenced under OVENCLEAR_QUIET so the test suite stays readable; the log is
 * production evidence, not test output.
 */
export function logEvent(event: string, fields: Record<string, unknown>): void {
  if (process.env.OVENCLEAR_QUIET === '1') return;
  process.stdout.write(
    JSON.stringify({ severity: 'INFO', event, ts: nowIso(), ...fields }) + '\n',
  );
}

export class Store {
  private readonly ordersPath: string;
  private readonly ledgerPath: string;
  private readonly orders = new Map<string, Order>();
  private readonly byToken = new Map<string, string>();
  private readonly bySession = new Map<string, string>();

  private constructor(private readonly dir: string) {
    this.ordersPath = join(dir, 'orders.jsonl');
    this.ledgerPath = join(dir, 'ledger.jsonl');
  }

  static open(dir: string): Store {
    mkdirSync(dir, { recursive: true });
    const s = new Store(dir);
    s.loadOrders();
    return s;
  }

  // ── orders ────────────────────────────────────────────────────────────────

  /**
   * Orders are an append-only log of full snapshots; the last row for an id
   * wins. Compaction rewrites the file with one row per order.
   */
  private loadOrders(): void {
    if (!existsSync(this.ordersPath)) return;
    const text = readFileSync(this.ordersPath, 'utf8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let o: Order;
      try {
        o = JSON.parse(t) as Order;
      } catch {
        continue; // torn final write — skip rather than refuse to boot
      }
      this.index(o);
    }
  }

  private index(o: Order): void {
    this.orders.set(o.orderId, o);
    this.byToken.set(o.token, o.orderId);
    if (o.stripeSessionId) this.bySession.set(o.stripeSessionId, o.orderId);
  }

  putOrder(o: Order): void {
    o.updatedAt = nowIso();
    this.index(o);
    appendFileSync(this.ordersPath, JSON.stringify(o) + '\n', 'utf8');
    logEvent('order_write', {
      orderId: o.orderId,
      status: o.status,
      amountUsd: o.amountUsd,
      state: o.intake.state,
      product: o.intake.productDescription,
    });
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getOrderByToken(token: string): Order | undefined {
    const id = this.byToken.get(token);
    return id ? this.orders.get(id) : undefined;
  }

  getOrderBySession(sessionId: string): Order | undefined {
    const id = this.bySession.get(sessionId);
    return id ? this.orders.get(id) : undefined;
  }

  allOrders(): Order[] {
    return [...this.orders.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Rewrite orders.jsonl with exactly one current row per order. */
  compact(): void {
    const tmp = this.ordersPath + '.tmp';
    writeFileSync(tmp, this.allOrders().map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8');
    renameSync(tmp, this.ordersPath);
  }

  // ── ledger ────────────────────────────────────────────────────────────────

  loadLedger(): LedgerEntry[] {
    if (!existsSync(this.ledgerPath)) return [];
    const text = readFileSync(this.ledgerPath, 'utf8');
    const out: LedgerEntry[] = [];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t) as LedgerEntry);
      } catch {
        break; // a torn tail row invalidates everything after it
      }
    }
    return out;
  }

  appendLedger(entry: LedgerEntry): void {
    appendFileSync(this.ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    logEvent('ledger_append', {
      seq: entry.seq,
      agent: entry.agent,
      kind: entry.kind,
      entryHash: entry.entryHash,
    });
  }

  get ledgerFile(): string {
    return this.ledgerPath;
  }

  get dataDir(): string {
    return this.dir;
  }
}
