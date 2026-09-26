import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, applyEdit } from '../../commission/document';
import { Repository } from '../repository';
import { resetDbForTests } from '../db';
import { drainQueue, unavailableCloud, type CloudAdapter } from '../sync';
import type { CommissionDocument } from '../../commission/types';

function freshIndexedDb() {
  // Each case gets a clean database so state cannot leak between tests.
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
}

function docNamed(title: string): CommissionDocument {
  return applyEdit(createDocument('AO-2026-0001'), { title });
}

describe('Repository', () => {
  beforeEach(freshIndexedDb);

  it('keeps a thumbnail beside an image without touching the original', async () => {
    const repo = new Repository('ws-1');
    const original = new Blob(['full'], { type: 'image/png' });
    await repo.putImage('img-1', original);
    await repo.setThumbnail('img-1', new Blob(['s'], { type: 'image/webp' }));
    const image = await repo.getImage('img-1');
    expect(image?.byteSize).toBe(original.size);
    expect(image?.thumb).toBeTruthy();
    await repo.setThumbnail('missing', null); // no image, nothing written
    expect(await repo.getImage('missing')).toBeNull();
  });

  it('saves and reloads a document without data loss', async () => {
    const repo = new Repository('ws-1');
    const doc = docNamed('Lobby triptych');
    await repo.save(doc, false);
    const row = await repo.load(doc.id);
    expect(row?.document.title).toBe('Lobby triptych');
  });

  it('reports saved-on-this-device when no cloud is configured, never synced', async () => {
    const repo = new Repository('ws-1');
    const row = await repo.save(docNamed('A'), false);
    expect(row.saveState).toBe('saved-local');
  });

  it('reports pending sync, not synced, immediately after a cloud-bound save', async () => {
    const repo = new Repository('ws-1');
    const row = await repo.save(docNamed('A'), true);
    expect(row.saveState).toBe('pending-sync');
  });

  it('does not surface another workspace’s documents', async () => {
    const mine = new Repository('ws-1');
    const theirs = new Repository('ws-2');
    const doc = docNamed('Private commission');
    await theirs.save(doc, false);

    expect(await mine.list()).toEqual([]);
    expect(await mine.load(doc.id)).toBeNull();
  });

  it('does not surface another workspace’s images', async () => {
    const mine = new Repository('ws-1');
    const theirs = new Repository('ws-2');
    await theirs.putImage('img-1', new Blob(['x'], { type: 'image/png' }));
    expect(await mine.getImage('img-1')).toBeNull();
  });

  it('refuses an image of the wrong type', async () => {
    const repo = new Repository('ws-1');
    await expect(repo.putImage('i', new Blob(['x'], { type: 'application/pdf' }))).rejects.toThrow(/Unsupported/);
  });

  it('queues one write per document rather than stacking retries', async () => {
    const repo = new Repository('ws-1');
    const doc = docNamed('A');
    await repo.save(doc, true);
    await repo.save(applyEdit(doc, { title: 'B' }), true);
    expect(await repo.pendingWrites()).toHaveLength(1);
  });
});

describe('offline behaviour', () => {
  beforeEach(freshIndexedDb);

  it('keeps edits made while offline and replays them once online', async () => {
    const repo = new Repository('ws-1');
    const doc = docNamed('Drafted at the show');
    await repo.save(doc, true);

    // Offline: the drain does nothing and the work stays queued.
    const offline = await drainQueue(repo, 'ws-1', workingCloud(), () => false);
    expect(offline.attempted).toBe(0);
    expect(await repo.pendingWrites()).toHaveLength(1);

    // Reopened and online: the queued write goes up exactly once.
    const cloud = workingCloud();
    const online = await drainQueue(repo, 'ws-1', cloud, () => true);
    expect(online.succeeded).toBe(1);
    expect(cloud.calls).toBe(1);
    expect(await repo.pendingWrites()).toHaveLength(0);
    expect((await repo.load(doc.id))?.saveState).toBe('synced');
  });

  it('creates no duplicate when the same document is drained twice', async () => {
    const repo = new Repository('ws-1');
    await repo.save(docNamed('A'), true);
    const cloud = workingCloud();
    await drainQueue(repo, 'ws-1', cloud, () => true);
    await drainQueue(repo, 'ws-1', cloud, () => true);
    expect(cloud.calls).toBe(1);
  });

  it('preserves a conflicting remote edit instead of overwriting it', async () => {
    const repo = new Repository('ws-1');
    const doc = docNamed('Local title');
    await repo.save(doc, true);

    const remote = applyEdit(doc, { title: 'Remote title' });
    await drainQueue(repo, 'ws-1', conflictingCloud(remote), () => true);

    const row = await repo.load(doc.id);
    expect(row?.document.title).toBe('Local title');
    expect(row?.conflict?.remote.title).toBe('Remote title');
    expect(row?.saveState).toBe('save-failed');
  });

  it('reports a failed write rather than claiming a save', async () => {
    const repo = new Repository('ws-1');
    const doc = docNamed('A');
    await repo.save(doc, true);
    await drainQueue(repo, 'ws-1', failingCloud(), () => true);
    expect((await repo.load(doc.id))?.saveState).toBe('save-failed');
    expect((await repo.pendingWrites())[0]?.lastError).toMatch(/network/i);
  });

  it('does nothing at all when no cloud adapter is configured', async () => {
    const repo = new Repository('ws-1');
    await repo.save(docNamed('A'), false);
    const report = await drainQueue(repo, 'ws-1', unavailableCloud, () => true);
    expect(report.attempted).toBe(0);
    expect(unavailableCloud.unavailableReason).toMatch(/not configured/i);
  });
});

function workingCloud(): CloudAdapter & { calls: number } {
  return {
    calls: 0,
    configured: true,
    unavailableReason: null,
    async upsertDocument() {
      this.calls += 1;
      return { status: 'ok' as const };
    },
    async uploadImage() {
      return { status: 'ok' as const };
    },
  };
}

function conflictingCloud(remote: CommissionDocument): CloudAdapter {
  return {
    configured: true,
    unavailableReason: null,
    async upsertDocument() {
      return { status: 'conflict' as const, remote: { document: remote, revision: 99 } };
    },
    async uploadImage() {
      return { status: 'ok' as const };
    },
  };
}

function failingCloud(): CloudAdapter {
  return {
    configured: true,
    unavailableReason: null,
    async upsertDocument(): Promise<never> {
      throw new Error('network unreachable');
    },
    async uploadImage(): Promise<never> {
      throw new Error('network unreachable');
    },
  };
}
