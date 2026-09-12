import { describe, expect, it } from 'vitest';
import type { StudioDefaults } from '../../lib/prefs';
import { missingFromCard, normaliseUrl, vcardFor } from '../contact';

const studio = (over: Partial<StudioDefaults> = {}): StudioDefaults => ({
  name: 'Bob Dylan',
  email: 'bob@example.com',
  phone: '512-555-0100',
  address: null,
  ...over,
});

describe('vcardFor', () => {
  it('is a card a phone will read', () => {
    const card = vcardFor(studio(), null);
    expect(card.startsWith('BEGIN:VCARD')).toBe(true);
    expect(card.trimEnd().endsWith('END:VCARD')).toBe(true);
    expect(card).toContain('VERSION:3.0');
  });

  it('carries the details that were filled in', () => {
    const card = vcardFor(studio(), 'https://example.com');
    expect(card).toContain('EMAIL;TYPE=INTERNET:bob@example.com');
    expect(card).toContain('TEL;TYPE=CELL:512-555-0100');
    expect(card).toContain('URL:https://example.com');
  });

  it('leaves out what was never filled in, rather than writing blanks', () => {
    const card = vcardFor(studio({ email: null, phone: null }), null);
    expect(card).not.toContain('EMAIL');
    expect(card).not.toContain('TEL');
  });

  it('still makes a card when the studio has no name', () => {
    expect(vcardFor(studio({ name: '  ' }), null)).toContain('FN:Artist');
  });

  it('escapes a comma so it does not split the field', () => {
    const card = vcardFor(studio({ name: 'Dylan, Bob' }), null);
    expect(card).toContain('FN:Dylan\\, Bob');
  });

  it('escapes a semicolon so it cannot split the address into fields', () => {
    expect(vcardFor(studio({ address: 'Unit 3; Mill Lane' }), null)).toContain('Unit 3\\; Mill Lane');
  });

  it('folds a multi-line address onto one line', () => {
    const card = vcardFor(studio({ address: '12 Mill Lane\nAustin, TX' }), null);
    expect(card).toContain('12 Mill Lane\\, Austin\\, TX');
    expect(card.split('\r\n').filter((line) => line.startsWith('ADR'))).toHaveLength(1);
  });
});

describe('missingFromCard', () => {
  it('says nothing is missing when it is all there', () => {
    expect(missingFromCard(studio())).toEqual([]);
  });

  it('names what to fill in before printing a sign', () => {
    expect(missingFromCard(studio({ name: '', phone: null }))).toEqual(['your name', 'a phone number']);
  });
});

describe('normaliseUrl', () => {
  it('accepts a bare domain the way people type it', () => {
    expect(normaliseUrl('mysite.com')).toBe('https://mysite.com');
  });

  it('leaves a real URL alone', () => {
    expect(normaliseUrl('http://mysite.com/shows')).toBe('http://mysite.com/shows');
  });

  it('treats blank as nothing', () => {
    expect(normaliseUrl('   ')).toBeNull();
  });
});
