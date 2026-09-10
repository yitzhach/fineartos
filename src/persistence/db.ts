/**
 * IndexedDB access. Records, image blobs and the pending-write queue all live
 * here. localStorage is used only for preferences (theme, wallpaper, layout) —
 * never for documents.
 *
 * Data is scoped by workspace id so that signing in as someone else cannot
 * surface the previous account's drafts.
 */

const DB_NAME = 'artist-os';
const DB_VERSION = 1;

export const STORE_DOCUMENTS = 'documents';
export const STORE_IMAGES = 'images';
export const STORE_QUEUE = 'pendingWrites';

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

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
