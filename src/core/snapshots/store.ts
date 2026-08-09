import { sha256Hex } from '../util/canonical';

/**
 * Snapshot store — the provenance backbone (COMPLEXITY.md §1/§2).
 *
 * Every crawled (here: FIXTURE) legal source page is stored content-hash
 * pinned and dated. Verdicts, label specs, and diffs reference snapshots by
 * SHA-256 content hash, never by mutable URL (invariant I1 support).
 *
 * This build is the in-memory + JSONL implementation; production swaps the
 * persistence for GCS without changing the record shape.
 */

export interface SnapshotRecord {
  id: string;
  state: string; // two-letter state code, e.g. "GA"
  url: string; // source URL (fixture URLs in this build)
  fetchedAt: string; // ISO-8601 UTC
  contentSha256: string;
  byteLength: number;
  content: string;
  /** All data in this build is synthetic. */
  fixture: true;
}

export interface SnapshotInput {
  id?: string;
  state: string;
  url: string;
  fetchedAt: string;
  content: string;
  fixture: true;
}

export class SnapshotConflictError extends Error {
  constructor(id: string) {
    super(`snapshot id "${id}" already exists with different content — snapshots are immutable`);
    this.name = 'SnapshotConflictError';
  }
}

export class SnapshotStore {
  private readonly byId = new Map<string, SnapshotRecord>();
  private readonly idByHash = new Map<string, string>();

  put(input: SnapshotInput): SnapshotRecord {
    if (input.fixture !== true) {
      throw new Error('this build only accepts fixture snapshots (fixture: true)');
    }
    if (!/^[A-Z]{2}$/.test(input.state)) {
      throw new Error(`snapshot state must be a 2-letter code, got "${input.state}"`);
    }
    if (Number.isNaN(Date.parse(input.fetchedAt))) {
      throw new Error(`snapshot fetchedAt must be ISO-8601, got "${input.fetchedAt}"`);
    }
    const contentSha256 = sha256Hex(input.content);
    const id =
      input.id ??
      `${input.state.toLowerCase()}-${input.fetchedAt.slice(0, 10)}-${contentSha256.slice(0, 8)}`;
    const existing = this.byId.get(id);
    if (existing) {
      if (existing.contentSha256 === contentSha256) return existing; // idempotent
      throw new SnapshotConflictError(id);
    }
    const record: SnapshotRecord = {
      id,
      state: input.state,
      url: input.url,
      fetchedAt: input.fetchedAt,
      contentSha256,
      byteLength: Buffer.byteLength(input.content, 'utf8'),
      content: input.content,
      fixture: true,
    };
    this.byId.set(id, record);
    if (!this.idByHash.has(contentSha256)) this.idByHash.set(contentSha256, id);
    return record;
  }

  get(id: string): SnapshotRecord | undefined {
    return this.byId.get(id);
  }

  mustGet(id: string): SnapshotRecord {
    const rec = this.byId.get(id);
    if (!rec) throw new Error(`snapshot "${id}" not found`);
    return rec;
  }

  getByHash(contentSha256: string): SnapshotRecord | undefined {
    const id = this.idByHash.get(contentSha256);
    return id ? this.byId.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Snapshots, optionally filtered by state, sorted by fetchedAt then id. */
  list(state?: string): SnapshotRecord[] {
    const all = [...this.byId.values()].filter((s) => !state || s.state === state);
    return all.sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt) || a.id.localeCompare(b.id));
  }

  latestFor(state: string, url?: string): SnapshotRecord | undefined {
    const candidates = this.list(state).filter((s) => !url || s.url === url);
    return candidates[candidates.length - 1];
  }

  get size(): number {
    return this.byId.size;
  }

  toJsonl(): string {
    return this.list()
      .map((r) => JSON.stringify(r))
      .join('\n');
  }

  static fromJsonl(text: string): SnapshotStore {
    const store = new SnapshotStore();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const raw = JSON.parse(trimmed) as SnapshotRecord;
      const rec = store.put({
        id: raw.id,
        state: raw.state,
        url: raw.url,
        fetchedAt: raw.fetchedAt,
        content: raw.content,
        fixture: true,
      });
      if (rec.contentSha256 !== raw.contentSha256) {
        throw new Error(`snapshot "${raw.id}" failed re-hash on import — corrupted export`);
      }
    }
    return store;
  }
}
