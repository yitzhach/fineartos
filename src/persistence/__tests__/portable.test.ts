import { describe, expect, it } from 'vitest';
import { applyEdit, createDocument, issueDocument } from '../../commission/document';
import { createUpdate, emptyDraft } from '../../commission/updates';
import type { Expense } from '../../finance/ledger';
import {
  EXPORT_SCHEMA,
  exportDocument,
  exportExpenses,
  importDocument,
  importDocumentFromText,
  importExpenses,
  newExpenses,
} from '../portable';

function sample() {
  return applyEdit(createDocument('AO-2026-0001'), {
    title: 'Lobby triptych',
    privateNotes: 'Internal: client haggles.',
    quote: {
      currency: 'USD',
      taxRatePct: 8.25,
      lineItems: [{ id: 'a', kind: 'artwork', description: 'Triptych', quantity: 1, unitPrice: 500000 }],
    },
    artwork: { ...createDocument('x').artwork, referenceImageIds: ['img-1', 'img-2'] },
  });
}

describe('exportDocument', () => {
  it('states plainly that images are not in the file', () => {
    const envelope = exportDocument(sample());
    expect(envelope.imagesIncluded).toBe(false);
    expect(envelope.referencedImageIds).toEqual(['img-1', 'img-2']);
  });

  it('round-trips a document back through import', () => {
    const result = importDocument(exportDocument(sample()), ['img-1', 'img-2']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.title).toBe('Lobby triptych');
      expect(result.missingImageIds).toEqual([]);
    }
  });

  it('names the images that are missing on this device', () => {
    const result = importDocument(exportDocument(sample()), ['img-1']);
    expect(result.ok && result.missingImageIds).toEqual(['img-2']);
  });

  it('round-trips issued snapshots intact', () => {
    const issued = issueDocument(sample());
    const result = importDocument(exportDocument(issued));
    expect(result.ok && result.document.issuedSnapshots).toHaveLength(1);
  });
});

describe('importDocument refuses bad input whole', () => {
  it('refuses a file of an unknown schema', () => {
    const result = importDocument({ schema: 'something-else', version: 1, document: {} });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toMatch(/Unrecognised file/);
  });

  it('refuses a future export version', () => {
    const result = importDocument({ schema: EXPORT_SCHEMA, version: 99, document: {} });
    expect(result.ok === false && result.errors[0]).toMatch(/Unsupported export version/);
  });

  it('refuses a document with a non-integer price, and accepts nothing from it', () => {
    const envelope = exportDocument(sample()) as unknown as Record<string, any>;
    envelope.document.quote.lineItems[0].unitPrice = 1234.56;
    const result = importDocument(envelope);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toMatch(/whole number of cents/);
  });

  it('reports every problem at once rather than the first', () => {
    const envelope = exportDocument(sample()) as unknown as Record<string, any>;
    envelope.document.quote.taxRatePct = 500;
    envelope.document.state = 'nonsense';
    const result = importDocument(envelope);
    expect(result.ok === false && result.errors.length).toBeGreaterThan(1);
  });

  it('refuses a payment of zero', () => {
    const envelope = exportDocument(sample()) as unknown as Record<string, any>;
    envelope.document.payments = [{ id: 'p', date: '2026-01-01', amount: 0, note: null }];
    expect(importDocument(envelope).ok).toBe(false);
  });

  it('refuses text that is not JSON at all', () => {
    const result = importDocumentFromText('<html>not a document</html>');
    expect(result.ok === false && result.errors[0]).toMatch(/not valid JSON/);
  });
});

describe('client updates in the file', () => {
  const withUpdates = () => {
    const doc = sample();
    const one = createUpdate(doc.id, {
      ...emptyDraft(),
      headline: 'Underpainting',
      photoIds: ['photo-1'],
    });
    const elsewhere = createUpdate('another-doc', { ...emptyDraft(), headline: 'Not this one' });
    return { doc, updates: [one, elsewhere] };
  };

  it('carries the commission’s own updates and nobody else’s', () => {
    const { doc, updates } = withUpdates();
    const envelope = exportDocument(doc, updates);
    expect(envelope.updates).toHaveLength(1);
    expect(envelope.updates[0]?.headline).toBe('Underpainting');
  });

  it('round-trips them', () => {
    const { doc, updates } = withUpdates();
    const result = importDocument(exportDocument(doc, updates), ['img-1', 'img-2'], ['photo-1']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updates).toHaveLength(1);
      expect(result.missingPhotoIds).toEqual([]);
    }
  });

  it('names a picture an update refers to that is not on this device', () => {
    const { doc, updates } = withUpdates();
    const result = importDocument(exportDocument(doc, updates), ['img-1', 'img-2'], []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.missingPhotoIds).toEqual(['photo-1']);
  });

  it('still reads a version 1 file, which had none', () => {
    const old = { ...exportDocument(sample()), version: 1 } as Record<string, unknown>;
    delete old.updates;
    const result = importDocument(old, ['img-1', 'img-2']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.updates).toEqual([]);
  });

  it('refuses an update belonging to another commission', () => {
    const envelope = exportDocument(sample()) as unknown as Record<string, unknown>;
    envelope.updates = [createUpdate('somewhere-else', emptyDraft())];
    const result = importDocument(envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('belongs to another commission');
  });
});

describe('the books as a file', () => {
  const row = (over: Partial<Expense> = {}): Expense => ({
    id: 'e1',
    date: '2026-03-04',
    category: 'materials',
    what: 'Linen, 3m',
    amount: 12500,
    miles: null,
    ratePerMile: null,
    receiptImageIds: ['img-9'],
    jobRef: null,
    note: null,
    createdAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z',
    ...over,
  });

  it('round-trips the rows', () => {
    const result = importExpenses(exportExpenses([row()]), ['img-9']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expenses).toHaveLength(1);
      expect(result.expenses[0]?.amount).toBe(12500);
      expect(result.missingImageIds).toEqual([]);
    }
  });

  it('keeps an amount nobody recorded null rather than zero', () => {
    const result = importExpenses(exportExpenses([row({ amount: null })]), ['img-9']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.expenses[0]?.amount).toBeNull();
  });

  it('names a receipt photograph that is not on this device', () => {
    const result = importExpenses(exportExpenses([row()]), []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.missingImageIds).toEqual(['img-9']);
  });

  it('says plainly that the photographs are not in the file', () => {
    expect(exportExpenses([row()]).imagesIncluded).toBe(false);
  });

  it('refuses a row with a category this app does not know', () => {
    const envelope = exportExpenses([row()]) as unknown as Record<string, any>;
    envelope.expenses[0].category = 'bitcoin';
    const result = importExpenses(envelope);
    expect(result.ok).toBe(false);
  });

  it('refuses a file that is not the books', () => {
    const result = importExpenses(exportDocument(sample()) as unknown);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('Unrecognised file');
  });

  it('never adds the same row twice', () => {
    expect(newExpenses([row(), row({ id: 'e2' })], [row()])).toHaveLength(1);
    expect(newExpenses([row()], [])).toHaveLength(1);
  });
});
