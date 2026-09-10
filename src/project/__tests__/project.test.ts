import { describe, expect, it } from 'vitest';
import { createDocument } from '../../commission/document';
import {
  addDocumentToProject,
  addInvoiceToProject,
  createProject,
  filedDocumentIds,
  projectItemCount,
  projectNameFor,
  removeFromProject,
  renameProject,
  setProjectCover,
} from '../project';

describe('projectNameFor', () => {
  it('prefers the title the artist gave the work', () => {
    const doc = { ...createDocument('AO-2026-0001'), title: 'Harbour triptych' };
    expect(projectNameFor(doc)).toBe('Harbour triptych');
  });

  it('falls back to the client when there is no title', () => {
    const doc = createDocument('AO-2026-0001');
    expect(projectNameFor({ ...doc, client: { ...doc.client, name: 'Ada' } })).toBe('Ada commission');
  });

  it('falls back to the document number, which always exists', () => {
    expect(projectNameFor(createDocument('AO-2026-0001'))).toBe('AO-2026-0001');
  });

  it('ignores a title that is only whitespace', () => {
    const doc = { ...createDocument('AO-2026-0002'), title: '   ' };
    expect(projectNameFor(doc)).toBe('AO-2026-0002');
  });
});

describe('filing items into a folder', () => {
  it('adds a document', () => {
    const project = addDocumentToProject(createProject('Harbour', null), 'doc-1');
    expect(project.documentIds).toEqual(['doc-1']);
  });

  it('does not file the same document twice', () => {
    let project = addDocumentToProject(createProject('Harbour', null), 'doc-1');
    project = addDocumentToProject(project, 'doc-1');
    expect(project.documentIds).toEqual(['doc-1']);
  });

  it('keeps documents and invoices in separate lists', () => {
    let project = addDocumentToProject(createProject('Harbour', null), 'doc-1');
    project = addInvoiceToProject(project, 'inv-1');
    expect(project.documentIds).toEqual(['doc-1']);
    expect(project.invoiceIds).toEqual(['inv-1']);
    expect(projectItemCount(project)).toBe(2);
  });

  it('holds several invoices for one project', () => {
    let project = createProject('Harbour', null);
    project = addInvoiceToProject(project, 'deposit');
    project = addInvoiceToProject(project, 'final');
    expect(project.invoiceIds).toEqual(['deposit', 'final']);
  });
});

describe('removing an item', () => {
  it('takes it out of the folder whichever list it was in', () => {
    let project = addDocumentToProject(createProject('Harbour', null), 'doc-1');
    project = addInvoiceToProject(project, 'inv-1');
    project = removeFromProject(project, 'inv-1');
    expect(project.invoiceIds).toEqual([]);
    expect(project.documentIds).toEqual(['doc-1']);
  });

  it('leaves other items alone', () => {
    let project = createProject('Harbour', null);
    project = addDocumentToProject(project, 'a');
    project = addDocumentToProject(project, 'b');
    expect(removeFromProject(project, 'a').documentIds).toEqual(['b']);
  });
});

describe('folder details', () => {
  it('trims a client name and treats blank as not set', () => {
    expect(createProject('Harbour', '  Ada  ').clientName).toBe('Ada');
    expect(createProject('Harbour', '   ').clientName).toBeNull();
  });

  it('renames without touching the contents', () => {
    const project = addDocumentToProject(createProject('Old', null), 'doc-1');
    const renamed = renameProject(project, 'New');
    expect(renamed.name).toBe('New');
    expect(renamed.documentIds).toEqual(['doc-1']);
  });

  it('starts with no cover image rather than a placeholder', () => {
    expect(createProject('Harbour', null).coverImageId).toBeNull();
  });

  it('sets and clears the cover image', () => {
    const project = setProjectCover(createProject('Harbour', null), 'img-1');
    expect(project.coverImageId).toBe('img-1');
    expect(setProjectCover(project, null).coverImageId).toBeNull();
  });
});

describe('filedDocumentIds', () => {
  it('collects every document across every folder', () => {
    const a = addDocumentToProject(createProject('A', null), 'doc-1');
    const b = addDocumentToProject(createProject('B', null), 'doc-2');
    expect(filedDocumentIds([a, b])).toEqual(new Set(['doc-1', 'doc-2']));
  });

  it('is empty when nothing has been filed', () => {
    expect(filedDocumentIds([createProject('A', null)]).size).toBe(0);
  });
});
