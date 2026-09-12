/**
 * A picture on the desktop.
 *
 * The artist's photographs of their own work, sitting on the desktop like
 * files: draggable, filable into a folder, and the thing the Connect tool
 * sends to a client. A photo carries what a buyer asks about — size, medium,
 * year, price — and every one of those is optional.
 *
 * Unknown stays unknown. A price that has not been set is null and reads
 * "Price on request"; it is never $0, and a size that was never measured is
 * never invented.
 *
 * DOM-free, like the rest of the model layer.
 */

import { newId } from '../commission/document';

export interface Photo {
  id: string;
  /** The image blob's id in the image store. */
  imageId: string;
  title: string;
  /** Pixel size of the stored image, for laying out a thumbnail. */
  pixelWidth: number;
  pixelHeight: number;
  /** The work's real size, as the artist measured it. Null = not recorded. */
  widthIn: number | null;
  heightIn: number | null;
  medium: string | null;
  year: number | null;
  /** Null = no price set. Never zero as a stand-in for "ask me". */
  price: number | null;
  currency: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createPhoto(
  input: { imageId: string; title: string; pixelWidth: number; pixelHeight: number },
  now = new Date(),
): Photo {
  const iso = now.toISOString();
  return {
    id: newId(),
    imageId: input.imageId,
    title: input.title.trim() || 'Untitled',
    pixelWidth: input.pixelWidth,
    pixelHeight: input.pixelHeight,
    widthIn: null,
    heightIn: null,
    medium: null,
    year: null,
    price: null,
    currency: 'USD',
    note: null,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function editPhoto(photo: Photo, changes: Partial<Photo>, now = new Date()): Photo {
  return { ...photo, ...changes, id: photo.id, updatedAt: now.toISOString() };
}

/** A title from a file name: no extension, underscores opened out. */
export function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '');
  const opened = withoutExtension.replace(/[_-]+/g, ' ').trim();
  return opened || 'Untitled';
}

/** "24 × 36 in", or null when the work has never been measured. */
export function describeSize(photo: Photo): string | null {
  if (photo.widthIn === null || photo.heightIn === null) return null;
  return `${trimNumber(photo.widthIn)} × ${trimNumber(photo.heightIn)} in`;
}

/**
 * What a price line says. A photo with no price says so in words, because a
 * blank space next to a picture reads as free.
 */
export function describePrice(photo: Photo): string {
  if (photo.price === null) return 'Price on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: photo.currency,
    maximumFractionDigits: photo.price % 1 === 0 ? 0 : 2,
  }).format(photo.price);
}

/** The line under a thumbnail: size, or medium, or the honest silence. */
export function describePhoto(photo: Photo): string {
  const parts = [describeSize(photo), photo.medium, photo.year ? String(photo.year) : null];
  const said = parts.filter((part): part is string => Boolean(part));
  return said.length > 0 ? said.join(' · ') : 'No details yet';
}

/**
 * The message that goes to a client with the picture. Only states what is
 * actually recorded — an unmeasured work says nothing about its size rather
 * than guessing.
 */
export function shareMessage(photo: Photo, studioName: string | null): string {
  const lines: string[] = [photo.title];
  const size = describeSize(photo);
  if (size) lines.push(size);
  if (photo.medium) lines.push(photo.medium);
  if (photo.year) lines.push(String(photo.year));
  lines.push(describePrice(photo));
  if (photo.note) lines.push('', photo.note);
  if (studioName?.trim()) lines.push('', `— ${studioName.trim()}`);
  return lines.join('\n');
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
