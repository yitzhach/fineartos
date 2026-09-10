/**
 * Project folders.
 *
 * A folder is a real record, not a view: it owns the ids of the commission
 * documents and invoices filed into it. It holds ids rather than copies, so a
 * folder can never disagree with the document it contains.
 *
 * Deleting a folder is deliberately not "delete everything inside it" — see
 * `removeFromProject`. Nothing in this app throws the artist's work away as a
 * side effect of tidying.
 *
 * DOM-free, like the rest of the model layer.
 */

import { newId } from '../commission/document';
import type { CommissionDocument } from '../commission/types';

export interface Project {
  id: string;
  name: string;
  /** Copied at creation for display and grouping; not a link to a client record. */
  clientName: string | null;
  documentIds: string[];
  invoiceIds: string[];
  /**
   * Image shown on the folder. Null means no image was uploaded, and the
   * folder draws its plain form rather than an empty frame.
   */
  coverImageId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Names a folder from what the document actually says, in the order an artist
 * would recognise it. Falls back to the document number, which always exists.
 */
export function projectNameFor(doc: CommissionDocument): string {
  const title = doc.title.trim();
  if (title) return title;
  const client = doc.client.name.trim();
  if (client) return `${client} commission`;
  return doc.documentNumber;
}

export function createProject(name: string, clientName: string | null, now = new Date()): Project {
  const iso = now.toISOString();
  return {
    id: newId(),
    name,
    clientName: clientName?.trim() ? clientName.trim() : null,
    documentIds: [],
    invoiceIds: [],
    coverImageId: null,
    createdAt: iso,
    updatedAt: iso,
  };
}

/** Files a document into a folder. Adding the same document twice is a no-op. */
export function addDocumentToProject(project: Project, documentId: string, now = new Date()): Project {
  if (project.documentIds.includes(documentId)) return project;
  return {
    ...project,
    documentIds: [...project.documentIds, documentId],
    updatedAt: now.toISOString(),
  };
}

export function addInvoiceToProject(project: Project, invoiceId: string, now = new Date()): Project {
  if (project.invoiceIds.includes(invoiceId)) return project;
  return {
    ...project,
    invoiceIds: [...project.invoiceIds, invoiceId],
    updatedAt: now.toISOString(),
  };
}

/**
 * Takes an item out of a folder. The item itself is untouched and still
 * exists — it goes back to sitting loose on the desktop.
 */
export function removeFromProject(project: Project, itemId: string, now = new Date()): Project {
  return {
    ...project,
    documentIds: project.documentIds.filter((id) => id !== itemId),
    invoiceIds: project.invoiceIds.filter((id) => id !== itemId),
    updatedAt: now.toISOString(),
  };
}

export function renameProject(project: Project, name: string, now = new Date()): Project {
  return { ...project, name, updatedAt: now.toISOString() };
}

export function setProjectCover(project: Project, imageId: string | null, now = new Date()): Project {
  return { ...project, coverImageId: imageId, updatedAt: now.toISOString() };
}

export function projectItemCount(project: Project): number {
  return project.documentIds.length + project.invoiceIds.length;
}

/** The ids of every document that is already filed in some folder. */
export function filedDocumentIds(projects: Project[]): Set<string> {
  return new Set(projects.flatMap((p) => p.documentIds));
}

export function filedInvoiceIds(projects: Project[]): Set<string> {
  return new Set(projects.flatMap((p) => p.invoiceIds));
}
