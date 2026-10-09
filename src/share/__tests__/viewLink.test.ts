import { describe, expect, it } from 'vitest';
import {
  expiresAt,
  fitWithin,
  isExpired,
  isPicture,
  isShareId,
  linkEndDate,
  newShareId,
  readCardInput,
  renderGonePage,
  renderSharePage,
  withViewingLink,
} from '../viewLink';

describe('viewing links', () => {
  it('makes 22-character url-safe ids from 16 random bytes', () => {
    const id = newShareId(() => new Uint8Array(16).fill(255));
    expect(id).toHaveLength(22);
    expect(isShareId(id)).toBe(true);
    expect(id).not.toMatch(/[+/=]/);
    expect(isShareId('../../secret')).toBe(false);
    expect(isShareId('short')).toBe(false);
  });

  it('needs a title and caps the details', () => {
    expect(readCardInput('  Dusk  ', ' Oil ')).toEqual({ title: 'Dusk', details: 'Oil' });
    expect(readCardInput('', 'x')).toBeNull();
    expect(readCardInput('x', 'y'.repeat(4001))).toBeNull();
    expect(readCardInput(null, 'x')).toBeNull();
  });

  it('expires after 90 days, and a broken date counts as expired', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const end = expiresAt(now);
    expect(end).toBe('2027-01-07T12:00:00.000Z');
    expect(isExpired({ expiresAt: end }, now)).toBe(false);
    expect(isExpired({ expiresAt: end }, new Date(end))).toBe(true);
    expect(isExpired({ expiresAt: 'soon' }, now)).toBe(true);
    expect(linkEndDate(end)).toBe('7 January 2027');
  });

  it('checks a picture by its first bytes, not its label', () => {
    expect(isPicture('image/jpeg', new Uint8Array([255, 216, 255]))).toBe(true);
    expect(isPicture('image/png', new Uint8Array([255, 216, 255]))).toBe(false);
    expect(isPicture('image/gif', new Uint8Array([71, 73, 70]))).toBe(false);
  });

  it('puts the link last in the message', () => {
    expect(withViewingLink('Dusk\nPrice on request\n', 'https://x/p/a')).toBe(
      'Dusk\nPrice on request\n\nSee the picture here: https://x/p/a',
    );
  });

  it('never enlarges, and caps the longest edge', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(6000, 4000)).toEqual({ width: 2400, height: 1600 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1200, height: 2400 });
  });

  it('escapes everything the studio typed on the client page', () => {
    const page = renderSharePage(
      { title: '<script>x</script>', details: 'A & "B"', expiresAt: '2027-01-07T12:00:00.000Z' },
      'AAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(page).not.toContain('<script>');
    expect(page).toContain('&lt;script&gt;');
    expect(page).toContain('A &amp; &quot;B&quot;');
    expect(page).toContain('/p/AAAAAAAAAAAAAAAAAAAAAA/picture');
    expect(page).toContain('stops working on 7 January 2027');
    expect(page).toContain('noindex');
  });

  it('says plainly when a link is gone', () => {
    expect(renderGonePage()).toContain('no longer available');
  });
});
