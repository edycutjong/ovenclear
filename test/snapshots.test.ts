import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/core/util/canonical';
import { SnapshotConflictError, SnapshotStore } from '../src/core/snapshots/store';

const base = {
  state: 'GA',
  url: 'https://fixture.example/ga',
  fetchedAt: '2026-07-01T06:00:00.000Z',
  fixture: true as const,
};

describe('SnapshotStore', () => {
  it('content-hash pins every snapshot (sha256 + byteLength)', () => {
    const store = new SnapshotStore();
    const rec = store.put({ ...base, id: 's1', content: 'law text' });
    expect(rec.contentSha256).toBe(sha256Hex('law text'));
    expect(rec.byteLength).toBe(Buffer.byteLength('law text'));
  });

  it('is idempotent for identical content and refuses silent overwrites', () => {
    const store = new SnapshotStore();
    const a = store.put({ ...base, id: 's1', content: 'law text' });
    const b = store.put({ ...base, id: 's1', content: 'law text' });
    expect(b).toBe(a);
    expect(() => store.put({ ...base, id: 's1', content: 'DIFFERENT' })).toThrow(SnapshotConflictError);
  });

  it('derives a dated, hash-suffixed id when none is given', () => {
    const store = new SnapshotStore();
    const rec = store.put({ ...base, content: 'x' });
    expect(rec.id).toBe(`ga-2026-07-01-${sha256Hex('x').slice(0, 8)}`);
  });

  it('looks up by content hash', () => {
    const store = new SnapshotStore();
    const rec = store.put({ ...base, id: 's1', content: 'law text' });
    expect(store.getByHash(rec.contentSha256)?.id).toBe('s1');
    expect(store.getByHash('0'.repeat(64))).toBeUndefined();
  });

  it('latestFor returns the newest snapshot by fetchedAt (optionally per url)', () => {
    const store = new SnapshotStore();
    store.put({ ...base, id: 'old', fetchedAt: '2026-06-01T00:00:00.000Z', content: 'v1' });
    store.put({ ...base, id: 'new', fetchedAt: '2026-07-01T00:00:00.000Z', content: 'v2' });
    store.put({ ...base, id: 'other-url', url: 'https://fixture.example/ga2', fetchedAt: '2026-07-02T00:00:00.000Z', content: 'v3' });
    expect(store.latestFor('GA')?.id).toBe('other-url');
    expect(store.latestFor('GA', base.url)?.id).toBe('new');
    expect(store.latestFor('TX')).toBeUndefined();
  });

  it('list() filters by state and sorts by fetchedAt', () => {
    const store = new SnapshotStore();
    store.put({ ...base, id: 'b', fetchedAt: '2026-07-02T00:00:00.000Z', content: 'b' });
    store.put({ ...base, id: 'a', fetchedAt: '2026-07-01T00:00:00.000Z', content: 'a' });
    store.put({ ...base, id: 'tx', state: 'TX', content: 'tx' });
    expect(store.list('GA').map((s) => s.id)).toEqual(['a', 'b']);
    expect(store.list().length).toBe(3);
  });

  it('JSONL roundtrip preserves records and re-verifies hashes', () => {
    const store = new SnapshotStore();
    store.put({ ...base, id: 's1', content: 'law text\nwith lines' });
    const round = SnapshotStore.fromJsonl(store.toJsonl());
    expect(round.mustGet('s1').contentSha256).toBe(store.mustGet('s1').contentSha256);
  });

  it('fromJsonl rejects corrupted exports (hash mismatch)', () => {
    const store = new SnapshotStore();
    const rec = store.put({ ...base, id: 's1', content: 'law text' });
    const corrupted = store
      .toJsonl()
      .replace('"law text"', '"law text (tampered)"');
    expect(rec.contentSha256).toBeTruthy();
    expect(() => SnapshotStore.fromJsonl(corrupted)).toThrow(/re-hash/);
  });

  it('rejects malformed inputs (state code, date, non-fixture)', () => {
    const store = new SnapshotStore();
    expect(() => store.put({ ...base, state: 'Georgia', content: 'x' })).toThrow(/2-letter/);
    expect(() => store.put({ ...base, fetchedAt: 'yesterday', content: 'x' })).toThrow(/ISO-8601/);
    // @ts-expect-error — fixture:false is rejected at runtime too
    expect(() => store.put({ ...base, fixture: false, content: 'x' })).toThrow(/fixture/);
  });
});
