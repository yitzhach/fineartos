/**
 * IndexedDB access. Records, image blobs and the pending-write queue all live
 * here. localStorage is used only for preferences (theme, wallpaper, layout) —
 * never for documents.
 *
 * Data is scoped by workspace id so that signing in as someone else cannot
 * surface the previous account's drafts.
 */

const DB_NAME = 'artist-os';
const DB_VERSION = 5;

export const STORE_DOCUMENTS = 'documents';
export const STORE_IMAGES = 'images';
export const STORE_QUEUE = 'pendingWrites';
/** Added in DB_VERSION 2: project folders and the invoices filed in them. */
export const STORE_PROJECTS = 'projects';
export const STORE_INVOICES = 'invoices';
/** Added in DB_VERSION 3: pictures that sit on the desktop as files. */
export const STORE_PHOTOS = 'photos';
/** Added in DB_VERSION 4: what the studio told a client, and what came back. */
export const STORE_UPDATES = 'clientUpdates';
/** Added in DB_VERSION 5: the books — what was spent, and on what. */
export const STORE_EXPENSES = 'expenses';

export interface StoredImage {
  id: string;
  workspaceId: string;
  blob: Blob;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export type PendingOp = 'upsertDocument' | 'uploadImage';

export interface PendingWrite {
  /** Stable id, reused on retry so a replay cannot create a duplicate. */
  id: string;
  workspaceId: string;
  op: PendingOp;
  targetId: string;
  /** Bumped on each local edit; the server keeps the highest it has seen. */
  revision: number;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * What went wrong opening the database, for the UI to show.
 *
 * This exists because of a real failure: version 3 added the photos store,
 * and a browser will not upgrade a database while another connection to the
 * old version is open. A second tab left open on the old version blocked the
 * upgrade, every read waited behind it, and the app sat there looking fine
 * and doing nothing — no records, no windows, uploads stuck on "Adding…",
 * and not one error on screen. A silent hang is the worst possible failure,
 * so now it is reported, and it is escapable without clearing any data.
 */
export type DbProblem =
  | { kind: 'blocked'; message: string }
  | { kind: 'superseded'; message: string }
  | { kind: 'failed'; message: string };

type ProblemListener = (problem: DbProblem) => void;

const listeners = new Set<ProblemListener>();
let lastProblem: DbProblem | null = null;

export function onDbProblem(listener: ProblemListener): () => void {
  listeners.add(listener);
  if (lastProblem) listener(lastProblem);
  return () => listeners.delete(listener);
}

function report(problem: DbProblem): void {
  lastProblem = problem;
  for (const listener of listeners) listener(problem);
}

/** Long enough for a slow disk, short enough that nobody sits staring. */
const OPEN_TIMEOUT_MS = 8000;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Nothing below ever leaves this promise pending: a hang here stops the
    // whole app, so every path ends in a resolve or a reject.
    const timer = setTimeout(() => {
      const message =
        'The studio could not be opened. Another tab of Artist OS is probably still open on an older version — close the other tabs and reload this page. Nothing has been lost.';
      report({ kind: 'blocked', message });
      dbPromise = null;
      reject(new Error(message));
    }, OPEN_TIMEOUT_MS);

    request.onblocked = () => {
      report({
        kind: 'blocked',
        message:
          'Another tab of Artist OS is holding the studio open. Close the other tabs and reload — nothing has been lost.',
      });
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        const store = db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId');
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        const store = db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId');
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId');
      }
      // Version 2 adds these two. Existing documents and images are left
      // exactly as they are: an upgrade must never cost the artist work.
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId');
      }
      if (!db.objectStoreNames.contains(STORE_INVOICES)) {
        const store = db.createObjectStore(STORE_INVOICES, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId');
      }
      // Version 3 adds photos. Same rule as version 2: nothing already
      // stored is touched, so an upgrade can never cost the artist work.
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        const store = db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId');
      }
      // Version 4 adds client updates. Same rule again: an upgrade adds a
      // shelf, it never touches what is already on the others.
      if (!db.objectStoreNames.contains(STORE_UPDATES)) {
        const store = db.createObjectStore(STORE_UPDATES, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId');
      }
      // Version 5 adds the books. Same rule as every upgrade before it: a new
      // shelf, and nothing already on the others is touched.
      if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
        const store = db.createObjectStore(STORE_EXPENSES, { keyPath: 'id' });
        store.createIndex('workspaceId', 'workspaceId');
      }
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;

      // A later version opened in another tab needs this connection closed,
      // or that tab hangs the way this one just did. Closing makes the
      // records unreachable here, so the page has to be reloaded — say so
      // rather than failing quietly.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        report({
          kind: 'superseded',
          message:
            'Artist OS was updated in another tab. Reload this page to carry on — your work is saved.',
        });
      };

      resolve(db);
    };

    request.onerror = () => {
      clearTimeout(timer);
      const message = request.error?.message ?? 'The studio could not be opened.';
      report({ kind: 'failed', message });
      dbPromise = null;
      reject(request.error ?? new Error(message));
    };
  });
  return dbPromise;
}

/** Test hook: forget the cached connection between cases. */
export function resetDbForTests(): void {
  dbPromise = null;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await promisify(tx.objectStore(storeName).put(value));
}

export async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return promisify<T | undefined>(tx.objectStore(storeName).get(key) as IDBRequest<T | undefined>);
}

export async function remove(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await promisify(tx.objectStore(storeName).delete(key));
}

/** Every read is scoped to one workspace; there is no unscoped list. */
export async function listByWorkspace<T>(storeName: string, workspaceId: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  const index = tx.objectStore(storeName).index('workspaceId');
  return promisify<T[]>(index.getAll(workspaceId) as IDBRequest<T[]>);
}
