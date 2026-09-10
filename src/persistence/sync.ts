/**
 * Cloud sync.
 *
 * No Supabase or R2 credentials exist for this project yet, so the only
 * adapter that ships is `unavailableCloud`, which reports itself unconfigured.
 * The queue drainer below is the real thing and works unchanged the moment a
 * configured adapter is supplied — see docs in PROJECT_GUIDE.md.
 *
 * Two rules this module will not bend:
 *  - Being online is not being synced. Only an adapter's confirmed write
 *    moves a document to 'synced'.
 *  - A remote version that disagrees is preserved as a conflict for the
 *    artist, never merged over the local copy.
 */

import type { CommissionDocument } from '../commission/types';
import type { Repository } from './repository';

export interface RemoteDocument {
  document: CommissionDocument;
  revision: number;
}

export interface CloudAdapter {
  readonly configured: boolean;
  /** Why sync is unavailable, shown verbatim in the UI. Null when configured. */
  readonly unavailableReason: string | null;
  /**
   * Writes the document if `expectedRemoteRevision` still matches the server.
   * A mismatch returns the remote copy instead of overwriting it.
   */
  upsertDocument(
    workspaceId: string,
    doc: CommissionDocument,
    revision: number,
  ): Promise<{ status: 'ok' } | { status: 'conflict'; remote: RemoteDocument }>;
  uploadImage(workspaceId: string, imageId: string, blob: Blob): Promise<{ status: 'ok' }>;
}

export const unavailableCloud: CloudAdapter = {
  configured: false,
  unavailableReason:
    'Cloud sync is not configured. No Supabase or R2 credentials are set for this build; documents are saved on this device only.',
  async upsertDocument() {
    throw new Error('Cloud sync is not configured.');
  },
  async uploadImage() {
    throw new Error('Cloud sync is not configured.');
  },
};

export interface DrainReport {
  attempted: number;
  succeeded: number;
  conflicted: number;
  failed: number;
}

/**
 * Retries queued writes once each. Called when the app is open and online;
 * there is no background sync, because a browser makes no promise to run it.
 */
export async function drainQueue(
  repo: Repository,
  workspaceId: string,
  adapter: CloudAdapter,
  isOnline: () => boolean = () => navigator.onLine,
): Promise<DrainReport> {
  const report: DrainReport = { attempted: 0, succeeded: 0, conflicted: 0, failed: 0 };
  if (!adapter.configured || !isOnline()) return report;

  for (const write of await repo.pendingWrites()) {
    report.attempted += 1;
    try {
      if (write.op === 'upsertDocument') {
        const row = await repo.load(write.targetId);
        if (!row) {
          await repo.clearPendingWrite(write.id);
          continue;
        }
        const result = await adapter.upsertDocument(workspaceId, row.document, write.revision);
        if (result.status === 'conflict') {
          await repo.recordConflict(write.targetId, result.remote.document);
          await repo.markSaveState(write.targetId, 'save-failed');
          await repo.clearPendingWrite(write.id);
          report.conflicted += 1;
          continue;
        }
        await repo.markSaveState(write.targetId, 'synced');
      } else {
        const image = await repo.getImage(write.targetId);
        if (image) await adapter.uploadImage(workspaceId, image.id, image.blob);
      }
      await repo.clearPendingWrite(write.id);
      report.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await repo.recordWriteFailure(write.id, message);
      await repo.markSaveState(write.targetId, 'save-failed');
      report.failed += 1;
    }
  }
  return report;
}

/** Wording the UI uses for each save state. Nothing here overstates. */
export function describeSaveState(state: string, adapter: CloudAdapter): string {
  switch (state) {
    case 'saved-local':
      return adapter.configured ? 'Saved on this device' : 'Saved on this device (cloud sync not configured)';
    case 'pending-sync':
      return 'Saved on this device · pending sync';
    case 'synced':
      return 'Synced';
    case 'save-failed':
      return 'Save failed — still on this device';
    default:
      return 'Unknown';
  }
}
