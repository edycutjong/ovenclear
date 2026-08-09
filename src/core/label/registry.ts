import { sha256Hex } from '../util/canonical';
import type { LabelArtifact } from './compose';

/**
 * Label registry — the `labels/{qrId}` record from ARCHITECTURE.md:
 * a STABLE qrId per order-label whose issue history grows with re-issues.
 * The public QR page renders exactly this record.
 */

export interface LabelIssueRecord {
  labelId: string;
  sha256: string;
  packVersion: string;
  snapshotHashes: string[];
  issuedAt: string;
  reissueOf: string | null;
  reissueReason: string | null;
}

export interface LabelRegistryEntry {
  qrId: string;
  orderId: string;
  customerId: string;
  state: string;
  issueHistory: LabelIssueRecord[];
}

export class LabelRegistry {
  private readonly byQrId = new Map<string, LabelRegistryEntry>();

  /** Deterministic stable qrId for an order's label. */
  static qrIdFor(orderId: string, state: string): string {
    return `qr_${sha256Hex(`ovenclear:qr:${state}:${orderId}`).slice(0, 12)}`;
  }

  create(orderId: string, customerId: string, state: string): LabelRegistryEntry {
    const qrId = LabelRegistry.qrIdFor(orderId, state);
    const existing = this.byQrId.get(qrId);
    if (existing) return existing;
    const entry: LabelRegistryEntry = { qrId, orderId, customerId, state, issueHistory: [] };
    this.byQrId.set(qrId, entry);
    return entry;
  }

  appendIssue(qrId: string, artifact: LabelArtifact): LabelRegistryEntry {
    const entry = this.byQrId.get(qrId);
    if (!entry) throw new Error(`label registry entry "${qrId}" not found — create() first`);
    if (artifact.qrId !== qrId) {
      throw new Error(`artifact qrId ${artifact.qrId} does not match registry entry ${qrId}`);
    }
    const last = entry.issueHistory[entry.issueHistory.length - 1];
    if (last && artifact.provenance.reissueOf !== last.labelId) {
      throw new Error(
        `re-issue must chain to the previous label (expected reissueOf=${last.labelId}, got ${String(artifact.provenance.reissueOf)})`,
      );
    }
    if (!last && artifact.provenance.reissueOf !== null) {
      throw new Error('first issue cannot claim a reissueOf predecessor');
    }
    entry.issueHistory.push({
      labelId: artifact.labelId,
      sha256: artifact.sha256,
      packVersion: artifact.packVersion,
      snapshotHashes: [...artifact.snapshotHashes],
      issuedAt: artifact.issuedAt,
      reissueOf: artifact.provenance.reissueOf,
      reissueReason: artifact.provenance.reissueReason,
    });
    return entry;
  }

  get(qrId: string): LabelRegistryEntry | undefined {
    return this.byQrId.get(qrId);
  }

  mustGet(qrId: string): LabelRegistryEntry {
    const e = this.byQrId.get(qrId);
    if (!e) throw new Error(`label registry entry "${qrId}" not found`);
    return e;
  }

  byState(state: string): LabelRegistryEntry[] {
    return [...this.byQrId.values()]
      .filter((e) => e.state === state)
      .sort((a, b) => a.qrId.localeCompare(b.qrId));
  }

  all(): LabelRegistryEntry[] {
    return [...this.byQrId.values()].sort((a, b) => a.qrId.localeCompare(b.qrId));
  }
}
