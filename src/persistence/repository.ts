/**
 * The app's only door to stored documents. The UI never touches IndexedDB
 * directly, so the workspace scoping and the save-state reporting below are
 * impossible to bypass by accident.
 */

import type { CommissionDocument } from '../commission/types';
import type { Invoice } from '../invoice/types';
import type { Photo } from '../photo/photo';
import type { ClientUpdate } from '../commission/updates';
import type { Expense } from '../finance/ledger';
import type { Project } from '../project/project';
import {
  STORE_DOCUMENTS,
  STORE_EXPENSES,
  STORE_IMAGES,
  STORE_INVOICES,
  STORE_PHOTOS,
  STORE_PROJECTS,
  STORE_QUEUE,
  STORE_UPDATES,
  type PendingWrite,
  type StoredImage,
  get,
  listByWorkspace,
  put,
  remove,
} from './db';

/**
 * What the UI is allowed to claim about a document.
 *
 * 'saved-local' means exactly that: on this device. Being online is not
 * evidence of a sync, so nothing may report 'synced' until the cloud adapter
 * has confirmed the write.
 */
export type SaveState = 'saved-local' | 'pending-sync' | 'synced' | 'save-failed';

export interface StoredDocument {
  id: string;
  workspaceId: string;
  /** Incremented locally on each save; used for conflict detection. */
  revision: number;
  document: CommissionDocument;
  saveState: SaveState;
  /** Set when a remote edit could not be merged. Never overwritten silently. */
  conflict: { remote: CommissionDocument; detectedAt: string } | null;
}

/**
 * Folders and invoices are wrapped in a row carrying the workspace id, the
 * same shape documents use, so `listByWorkspace` scoping works identically and
 * a record from another workspace reads as absent rather than as data.
 */
interface ProjectRow {
  id: string;
  workspaceId: string;
  project: Project;
}

interface InvoiceRow {
  id: string;
  workspaceId: string;
  invoice: Invoice;
}

interface PhotoRow {
  id: string;
  workspaceId: string;
  photo: Photo;
}

interface UpdateRow {
  id: string;
  workspaceId: string;
  update: ClientUpdate;
}

interface ExpenseRow {
  id: string;
  workspaceId: string;
  expense: Expense;
}

/**
 * Fields added after a record was first written come back undefined from
 * storage. Filling them in on read means the rest of the app never has to
 * ask whether a folder is old or new.
 */
function withImageIds(project: Project): Project {
  return { ...project, imageIds: project.imageIds ?? [] };
}

function invoiceWithImageIds(invoice: Invoice): Invoice {
  return { ...invoice, imageIds: invoice.imageIds ?? [] };
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export class Repository {
  constructor(private readonly workspaceId: string) {}

  async list(): Promise<StoredDocument[]> {
    const rows = await listByWorkspace<StoredDocument>(STORE_DOCUMENTS, this.workspaceId);
    return rows.sort((a, b) => b.document.updatedAt.localeCompare(a.document.updatedAt));
  }

  async load(id: string): Promise<StoredDocument | null> {
    const row = await get<StoredDocument>(STORE_DOCUMENTS, id);
    // A row from another workspace is treated as absent, not returned.
    if (!row || row.workspaceId !== this.workspaceId) return null;
    return row;
  }

  /**
   * Writes locally and queues the cloud write. Returns the row with the state
   * the UI may display — 'pending-sync' when a cloud target is configured,
   * 'saved-local' when it is not, and never 'synced' from here.
   */
  async save(document: CommissionDocument, cloudConfigured: boolean): Promise<StoredDocument> {
    const existing = await this.load(document.id);
    const row: StoredDocument = {
      id: document.id,
      workspaceId: this.workspaceId,
      revision: (existing?.revision ?? 0) + 1,
      document,
      saveState: cloudConfigured ? 'pending-sync' : 'saved-local',
      conflict: existing?.conflict ?? null,
    };
    await put(STORE_DOCUMENTS, row);
    if (cloudConfigured) await this.enqueue(document.id, row.revision, 'upsertDocument');
    return row;
  }

  async markSaveState(id: string, saveState: SaveState): Promise<void> {
    const row = await this.load(id);
    if (!row) return;
    await put(STORE_DOCUMENTS, { ...row, saveState });
  }

  /**
   * Records a remote version that disagrees with the local one. Both copies
   * are kept for the artist to resolve; neither is discarded here.
   */
  async recordConflict(id: string, remote: CommissionDocument): Promise<void> {
    const row = await this.load(id);
    if (!row) return;
    await put(STORE_DOCUMENTS, {
      ...row,
      conflict: { remote, detectedAt: new Date().toISOString() },
    });
  }

  /**
   * Deletes a document outright. Used by the "remove demo" action; ordinary
   * work is archived rather than destroyed, which is what `archive` is for.
   */
  async deleteDocument(id: string): Promise<void> {
    const row = await this.load(id);
    if (!row) return;
    await remove(STORE_DOCUMENTS, id);
  }

  async archive(id: string): Promise<void> {
    const row = await this.load(id);
    if (!row) return;
    await this.save({ ...row.document, state: 'archived' }, row.saveState !== 'saved-local');
  }

  // --- Project folders ----------------------------------------------------
  //
  // Folders and invoices are local records. They are not queued for cloud
  // sync: no adapter is configured, and queueing a write nothing can send
  // would put rows in the queue that can only ever fail.

  async listProjects(): Promise<Project[]> {
    const rows = await listByWorkspace<ProjectRow>(STORE_PROJECTS, this.workspaceId);
    return rows
      .map((row) => withImageIds(row.project))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadProject(id: string): Promise<Project | null> {
    const row = await get<ProjectRow>(STORE_PROJECTS, id);
    if (!row || row.workspaceId !== this.workspaceId) return null;
    return withImageIds(row.project);
  }

  async saveProject(project: Project): Promise<void> {
    await put(STORE_PROJECTS, { id: project.id, workspaceId: this.workspaceId, project });
  }

  /**
   * Removes the folder only. Every document and invoice that was inside it
   * still exists and goes back to the desktop — a folder is a container, and
   * emptying the container is not the same as burning what was in it.
   */
  async deleteProject(id: string): Promise<void> {
    const existing = await this.loadProject(id);
    if (!existing) return;
    await remove(STORE_PROJECTS, id);
  }

  // --- Invoices -----------------------------------------------------------

  async listInvoices(): Promise<Invoice[]> {
    const rows = await listByWorkspace<InvoiceRow>(STORE_INVOICES, this.workspaceId);
    return rows
      .map((row) => invoiceWithImageIds(row.invoice))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadInvoice(id: string): Promise<Invoice | null> {
    const row = await get<InvoiceRow>(STORE_INVOICES, id);
    if (!row || row.workspaceId !== this.workspaceId) return null;
    return invoiceWithImageIds(row.invoice);
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    await put(STORE_INVOICES, { id: invoice.id, workspaceId: this.workspaceId, invoice });
  }

  async deleteInvoice(id: string): Promise<void> {
    const existing = await this.loadInvoice(id);
    if (!existing) return;
    await remove(STORE_INVOICES, id);
  }

  // --- Client updates -------------------------------------------------------

  async listUpdates(): Promise<ClientUpdate[]> {
    const rows = await listByWorkspace<UpdateRow>(STORE_UPDATES, this.workspaceId);
    return rows
      .map((row) => row.update)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveUpdate(update: ClientUpdate): Promise<void> {
    await put(STORE_UPDATES, { id: update.id, workspaceId: this.workspaceId, update });
  }

  async deleteUpdate(id: string): Promise<void> {
    await remove(STORE_UPDATES, id);
  }

  // --- The books ------------------------------------------------------------

  async listExpenses(): Promise<Expense[]> {
    const rows = await listByWorkspace<ExpenseRow>(STORE_EXPENSES, this.workspaceId);
    return rows.map((row) => row.expense).sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveExpense(expense: Expense): Promise<void> {
    await put(STORE_EXPENSES, { id: expense.id, workspaceId: this.workspaceId, expense });
  }

  async deleteExpense(id: string): Promise<void> {
    await remove(STORE_EXPENSES, id);
  }

  // --- Photos -------------------------------------------------------------

  async listPhotos(): Promise<Photo[]> {
    const rows = await listByWorkspace<PhotoRow>(STORE_PHOTOS, this.workspaceId);
    return rows
      .map((row) => row.photo)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadPhoto(id: string): Promise<Photo | null> {
    const row = await get<PhotoRow>(STORE_PHOTOS, id);
    if (!row || row.workspaceId !== this.workspaceId) return null;
    return row.photo;
  }

  async savePhoto(photo: Photo): Promise<void> {
    await put(STORE_PHOTOS, { id: photo.id, workspaceId: this.workspaceId, photo });
  }

  /** Removes the record. The image blob is dealt with by the caller. */
  async deletePhoto(id: string): Promise<void> {
    const existing = await this.loadPhoto(id);
    if (!existing) return;
    await remove(STORE_PHOTOS, id);
  }

  // --- Images -------------------------------------------------------------

  async putImage(id: string, blob: Blob): Promise<StoredImage> {
    if (!ALLOWED_IMAGE_TYPES.includes(blob.type)) {
      throw new Error(`Unsupported image type: ${blob.type || 'unknown'}`);
    }
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
    }
    const image: StoredImage = {
      id,
      workspaceId: this.workspaceId,
      blob,
      mimeType: blob.type,
      byteSize: blob.size,
      createdAt: new Date().toISOString(),
    };
    await put(STORE_IMAGES, image);
    return image;
  }

  /**
   * Deletes an image blob. Used when a wallpaper is removed from the library;
   * documents keep their images until the document itself goes.
   */
  async deleteImage(id: string): Promise<void> {
    const image = await this.getImage(id);
    if (!image) return;
    await remove(STORE_IMAGES, id);
  }

  async getImage(id: string): Promise<StoredImage | null> {
    const image = await get<StoredImage>(STORE_IMAGES, id);
    if (!image || image.workspaceId !== this.workspaceId) return null;
    return image;
  }

  // --- Pending write queue ------------------------------------------------

  private async enqueue(targetId: string, revision: number, op: PendingWrite['op']): Promise<void> {
    // The id is derived from the target and op, so re-saving the same document
    // replaces its queued write instead of stacking a second one.
    const write: PendingWrite = {
      id: `${this.workspaceId}:${op}:${targetId}`,
      workspaceId: this.workspaceId,
      op,
      targetId,
      revision,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    };
    await put(STORE_QUEUE, write);
  }

  async pendingWrites(): Promise<PendingWrite[]> {
    return listByWorkspace<PendingWrite>(STORE_QUEUE, this.workspaceId);
  }

  async clearPendingWrite(id: string): Promise<void> {
    await remove(STORE_QUEUE, id);
  }

  async recordWriteFailure(id: string, message: string): Promise<void> {
    const write = await get<PendingWrite>(STORE_QUEUE, id);
    if (!write || write.workspaceId !== this.workspaceId) return;
    await put(STORE_QUEUE, { ...write, attempts: write.attempts + 1, lastError: message });
  }
}
