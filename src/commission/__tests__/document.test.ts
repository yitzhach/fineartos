import { describe, expect, it } from 'vitest';
import {
  applyEdit,
  createDocument,
  duplicateDocument,
  issueDocument,
  latestSnapshot,
  nextDocumentNumber,
  recordPayment,
  toClientFacing,
} from '../document';

function filled() {
  let doc = createDocument('AO-2026-0001');
  doc = applyEdit(doc, {
    title: 'Lobby triptych',
    privateNotes: 'Client haggles; hold firm at list price.',
    client: { ...doc.client, name: 'Ruiz Collection' },
    quote: {
      ...doc.quote,
      lineItems: [{ id: 'a', kind: 'artwork', description: 'Triptych', quantity: 1, unitPrice: 500000 }],
    },
  });
  return recordPayment(doc, { date: '2026-02-01', amount: 250000, note: 'Deposit' });
}

describe('nextDocumentNumber', () => {
  it('starts at 0001 for a new year', () => {
    expect(nextDocumentNumber([], 2026)).toBe('AO-2026-0001');
  });

  it('continues from the highest existing number', () => {
    expect(nextDocumentNumber(['AO-2026-0001', 'AO-2026-0009', 'AO-2025-0100'], 2026)).toBe('AO-2026-0010');
  });
});

describe('toClientFacing', () => {
  it('omits private notes', () => {
    const client = toClientFacing(filled()) as unknown as Record<string, unknown>;
    expect(client.privateNotes).toBeUndefined();
    expect(JSON.stringify(client)).not.toContain('haggles');
  });

  it('omits internal bookkeeping fields', () => {
    const client = toClientFacing(filled()) as unknown as Record<string, unknown>;
    expect(client.id).toBeUndefined();
    expect(client.issuedSnapshots).toBeUndefined();
    expect(client.isDemo).toBeUndefined();
  });
});

describe('duplicateDocument', () => {
  it('gives the copy a new id and document number', () => {
    const source = filled();
    const copy = duplicateDocument(source, 'AO-2026-0002');
    expect(copy.id).not.toBe(source.id);
    expect(copy.documentNumber).toBe('AO-2026-0002');
  });

  it('does not carry over receipts', () => {
    expect(duplicateDocument(filled(), 'AO-2026-0002').payments).toEqual([]);
  });

  it('does not carry over issued history, and starts as a draft', () => {
    const copy = duplicateDocument(issueDocument(filled()), 'AO-2026-0002');
    expect(copy.issuedSnapshots).toEqual([]);
    expect(copy.state).toBe('draft');
    expect(copy.version).toBe(1);
  });

  it('keeps the artwork and pricing details', () => {
    const copy = duplicateDocument(filled(), 'AO-2026-0002');
    expect(copy.quote.lineItems[0]?.unitPrice).toBe(500000);
  });
});

describe('issuing and revising', () => {
  it('freezes a snapshot at the issued version', () => {
    const issued = issueDocument(filled());
    expect(issued.state).toBe('issued');
    expect(latestSnapshot(issued)?.version).toBe(1);
    expect(latestSnapshot(issued)?.document.title).toBe('Lobby triptych');
  });

  it('leaves the issued snapshot untouched when the draft is edited', () => {
    const issued = issueDocument(filled());
    const revised = applyEdit(issued, { title: 'Lobby triptych, revised' });
    expect(latestSnapshot(revised)?.document.title).toBe('Lobby triptych');
    expect(revised.title).toBe('Lobby triptych, revised');
  });

  it('bumps to a new draft revision after an edit to an issued document', () => {
    const revised = applyEdit(issueDocument(filled()), { title: 'v2' });
    expect(revised.version).toBe(2);
    expect(revised.state).toBe('draft');
  });

  it('keeps every issued snapshot in order', () => {
    let doc = issueDocument(filled());
    doc = issueDocument(applyEdit(doc, { title: 'v2' }));
    expect(doc.issuedSnapshots.map((s) => s.version)).toEqual([1, 2]);
    expect(doc.issuedSnapshots[0]?.document.title).toBe('Lobby triptych');
  });

  it('never puts private notes in a snapshot', () => {
    const issued = issueDocument(filled());
    expect(JSON.stringify(issued.issuedSnapshots)).not.toContain('haggles');
  });
});
