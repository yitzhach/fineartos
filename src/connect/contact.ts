/**
 * The contact card behind the QR code.
 *
 * A QR at a booth should do something useful the moment it is scanned, with
 * no app to install and no signal required. A vCard does exactly that: the
 * phone offers to save the studio's details straight into Contacts.
 *
 * What this cannot do is collect anything. A code that opened a form on the
 * visitor's phone would save their answers on *their* phone, where the studio
 * would never see them — that needs a server, and until there is one this
 * file is honest about only handing details out.
 */

import type { StudioDefaults } from '../lib/prefs';

/** vCard 3.0: the version every phone camera still understands. */
export function vcardFor(studio: StudioDefaults, website: string | null): string {
  const name = studio.name.trim() || 'Artist';
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCard(name)}`,
    `N:${escapeVCard(name)};;;;`,
  ];

  if (studio.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(studio.email.trim())}`);
  if (studio.phone?.trim()) lines.push(`TEL;TYPE=CELL:${escapeVCard(studio.phone.trim())}`);
  if (studio.address?.trim()) {
    // A vCard address is semicolon-separated fields; the whole thing goes in
    // the street slot rather than being guessed apart into city and state.
    lines.push(`ADR;TYPE=WORK:;;${escapeVCard(oneLine(studio.address))};;;;`);
  }
  if (website?.trim()) lines.push(`URL:${escapeVCard(website.trim())}`);

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/** What is missing from the card, so the artist can be told before printing it. */
export function missingFromCard(studio: StudioDefaults): string[] {
  const missing: string[] = [];
  if (!studio.name.trim()) missing.push('your name');
  if (!studio.email?.trim()) missing.push('an email address');
  if (!studio.phone?.trim()) missing.push('a phone number');
  return missing;
}

/** Adds https:// to something typed as "mysite.com", and leaves a real URL alone. */
export function normaliseUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function escapeVCard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function oneLine(value: string): string {
  return value.replace(/\s*\n\s*/g, ', ').trim();
}
