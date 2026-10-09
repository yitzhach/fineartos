import { describe, expect, it } from 'vitest';
import { createPhoto, editPhoto, type Photo } from '../../photo/photo';
import { createShow, editShow } from '../shows';
import { certificateHtml, detailLine, escapeHtml, priceListHtml, printedPrice, wallLabelsHtml } from '../prints';

const now = new Date('2026-10-09T12:00:00Z');
const piece = (title: string, over: Partial<Photo> = {}): Photo =>
  editPhoto(createPhoto({ imageId: 'i', title, pixelWidth: 1, pixelHeight: 1 }, now), over, now);
const studio = { name: 'Isaac Anderson Art', email: 'a@b.c', phone: null };

describe('printed lines', () => {
  it('never prints $0 for an unknown price', () => {
    expect(printedPrice(piece('A'))).toBe('Price on request');
    expect(printedPrice(piece('B', { price: 1200 }))).toBe('$1,200');
    expect(printedPrice(piece('C', { price: 5, status: 'sold' }))).toBe('Sold');
    expect(printedPrice(piece('D', { price: 5, status: 'nfs' }))).toBe('Not for sale');
  });
  it('leaves off what was never recorded', () => {
    expect(detailLine(piece('A'))).toBe('');
    expect(detailLine(piece('A', { widthIn: 24, heightIn: 36, medium: 'Oil', year: 2025 }))).toBe('24 × 36 in · Oil · 2025');
  });
  it('escapes what the artist typed', () => {
    expect(escapeHtml('<b>"Rock" & roll\'s</b>')).toBe('&lt;b&gt;&quot;Rock&quot; &amp; roll&#39;s&lt;/b&gt;');
  });
});

describe('sheets', () => {
  const show = editShow(createShow('Spring Market', now), { venue: 'Pier 3', startDate: '2026-10-10' }, now);
  const pieces = [piece('River', { price: 800, widthIn: 24, heightIn: 36 }), piece('<Lake>')];

  it('price list: every piece, numbered, escaped', () => {
    const html = priceListHtml(show, pieces, studio);
    expect(html).toContain('Spring Market');
    expect(html).toContain('Pier 3');
    expect(html).toContain('$800');
    expect(html).toContain('&lt;Lake&gt;');
    expect(html).toContain('Price on request');
    expect(html).not.toContain('$0');
  });

  it('labels: one per piece, artist named only when set', () => {
    expect(wallLabelsHtml(pieces, studio).match(/class="label"/g)).toHaveLength(2);
    expect(wallLabelsHtml(pieces, { name: '', email: null, phone: null })).not.toContain('class="artist"');
  });

  it('certificate: a blank to fill when no artist name is set', () => {
    const named = certificateHtml(pieces[0]!, studio, 'blob:x', '2026-10-09');
    expect(named).toContain('original work by Isaac Anderson Art');
    expect(named).toContain('<img src="blob:x"');
    expect(named).toContain('24 × 36 in');
    const blank = certificateHtml(pieces[1]!, { name: null, email: null, phone: null }, null, '');
    expect(blank).toContain('original work by ______');
    expect(blank).not.toContain('<img');
    expect(blank).not.toMatch(/<th>Year<\/th>/);
  });
});
