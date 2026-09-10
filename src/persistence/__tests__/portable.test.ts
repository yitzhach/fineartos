import { describe, expect, it } from 'vitest';
import { applyEdit, createDocument, issueDocument } from '../../commission/document';
import { EXPORT_SCHEMA, exportDocument, importDocument, importDocumentFromText } from '../portable';

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
