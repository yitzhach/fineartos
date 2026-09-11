/**
 * The cloud adapter that talks to `worker/index.ts`.
 *
 * Ported from the commission baseline, where the Worker, the Postgres schema
 * and the row-level security policies were already written and reviewed. This
 * file is the client half, reshaped to the `CloudAdapter` interface this app
 * already drains its queue through.
 *
 * It is NOT switched on. `App.tsx` still uses `unavailableCloud`, because
 * turning this on requires four things that do not exist yet:
 *
 *   1. A Supabase project, with `migrations/001_commissions.sql` applied.
 *   2. SUPABASE_URL and SUPABASE_ANON_KEY as Worker secrets.
 *   3. A private R2 bucket bound as IMAGES, for reference images.
 *   4. A sign-in flow, so `session()` can return a real token.
 *
 * Until all four exist, constructing this adapter with a session function
 * that returns null is correct and honest: it reports itself unconfigured and
 * the UI says so, rather than showing a Synced badge over nothing.
 *
 * The concurrency rules live on the server, not here. `expected_revision` and
 * `operation_id` go with every write: the server refuses a write whose
 * revision has moved on (returning the remote copy as a conflict) and treats a
 * repeated operation id as already applied, so a retry after a dropped
 * connection cannot write twice.
 */

import type { CommissionDocument } from '../commission/types';
import type { CloudAdapter, RemoteDocument } from './sync';

export interface Session {
  token: string;
  workspace: string;
  user: string;
}

export type SessionSource = () => Promise<Session | null>;

export interface WorkerCloudOptions {
  session: SessionSource;
  /** Same-origin by default: the Worker serves both the API and the app. */
  endpoint?: string;
}

export class WorkerCloud implements CloudAdapter {
  private readonly session: SessionSource;
  private readonly endpoint: string;

  constructor(options: WorkerCloudOptions) {
    this.session = options.session;
    this.endpoint = options.endpoint ?? '';
  }

  /**
   * Deliberately optimistic: the app treats the adapter as configured and
   * lets a failed call surface as a failed save. Claiming "configured" while
   * a request is in flight is better than claiming "synced" before one
   * returns — the first is a guess about setup, the second is a lie about
   * the artist's data.
   */
  get configured(): boolean {
    return true;
  }

  get unavailableReason(): string | null {
    return null;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const session = await this.session();
    if (!session) throw new Error('Sign in required before syncing.');

    return fetch(
      `${this.endpoint}/api/workspaces/${encodeURIComponent(session.workspace)}${path}`,
      {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${session.token}` },
      },
    );
  }

  async upsertDocument(
    _workspaceId: string,
    doc: CommissionDocument,
    revision: number,
  ): Promise<{ status: 'ok' } | { status: 'conflict'; remote: RemoteDocument }> {
    const response = await this.request(`/documents/${encodeURIComponent(doc.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: doc,
        expected_revision: revision,
        // Derived from the document and its revision, so a retry of the same
        // write carries the same id and the server can recognise it.
        operation_id: `${doc.id}:${revision}`,
      }),
    });

    if (response.status === 409) {
      const body = (await response.json()) as { remote?: { document: CommissionDocument; revision: number } };
      if (!body.remote) {
        // The server saw a conflict but sent no copy. Refusing to guess:
        // treat it as a failure so the local copy is kept and retried.
        throw new Error('The server reported a conflict without sending the remote copy.');
      }
      return {
        status: 'conflict',
        remote: { document: body.remote.document, revision: body.remote.revision },
      };
    }

    if (!response.ok) {
      throw new Error(await describeFailure(response, 'Sync failed; your copy is still on this device.'));
    }

    return { status: 'ok' };
  }

  async uploadImage(_workspaceId: string, imageId: string, blob: Blob): Promise<{ status: 'ok' }> {
    const response = await this.request(`/images/${encodeURIComponent(imageId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });

    if (!response.ok) {
      throw new Error(await describeFailure(response, 'Image sync failed; it is still on this device.'));
    }
    return { status: 'ok' };
  }
}

/** The server's own wording where it gave one, so errors are not invented. */
async function describeFailure(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    /* a non-JSON error body is not worth a second failure */
  }
  return fallback;
}
