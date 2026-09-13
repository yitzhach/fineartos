import { describe, expect, it } from 'vitest';
import { neutralAdjustments } from '../adjust';
import {
  createPhoto,
  describePhoto,
  describePrice,
  describeSize,
  describeStatus,
  editPhoto,
  isInCurrentShow,
  isEdited,
  isShownToVisitors,
  sourceImageId,
  statusOf,
  shareMessage,
  titleFromFileName,
} from '../photo';

const base = () =>
  createPhoto({ imageId: 'img-1', title: 'Harbour light', pixelWidth: 1200, pixelHeight: 900 });

describe('createPhoto', () => {
  it('records nothing it was not told', () => {
    const photo = base();
    expect(photo.price).toBeNull();
    expect(photo.widthIn).toBeNull();
    expect(photo.medium).toBeNull();
  });

  it('falls back to Untitled rather than an empty name', () => {
    expect(createPhoto({ imageId: 'i', title: '   ', pixelWidth: 1, pixelHeight: 1 }).title).toBe('Untitled');
  });
});

describe('titleFromFileName', () => {
  it('drops the extension and opens out separators', () => {
    expect(titleFromFileName('harbour_light-study.JPG')).toBe('harbour light study');
  });

  it('never returns an empty title', () => {
    expect(titleFromFileName('.png')).toBe('Untitled');
  });
});

describe('describeSize', () => {
  it('says nothing when the work has not been measured', () => {
    expect(describeSize(base())).toBeNull();
  });

  it('needs both sides before it will state a size', () => {
    expect(describeSize(editPhoto(base(), { widthIn: 24 }))).toBeNull();
  });

  it('reads the way an artist writes it', () => {
    expect(describeSize(editPhoto(base(), { widthIn: 24, heightIn: 36 }))).toBe('24 × 36 in');
  });

  it('keeps a half inch without trailing zeros', () => {
    expect(describeSize(editPhoto(base(), { widthIn: 24.5, heightIn: 36 }))).toBe('24.5 × 36 in');
  });
});

describe('describePrice', () => {
  it('says price on request rather than showing nothing', () => {
    expect(describePrice(base())).toBe('Price on request');
  });

  it('never reads a missing price as free', () => {
    expect(describePrice(base())).not.toContain('$0');
  });

  it('shows a set price whole when it is whole', () => {
    expect(describePrice(editPhoto(base(), { price: 5200 }))).toBe('$5,200');
  });

  it('keeps the cents when there are cents', () => {
    expect(describePrice(editPhoto(base(), { price: 5200.5 }))).toBe('$5,200.50');
  });

  it('shows a genuine zero as zero', () => {
    expect(describePrice(editPhoto(base(), { price: 0 }))).toBe('$0');
  });
});

describe('describePhoto', () => {
  it('admits when nothing has been filled in', () => {
    expect(describePhoto(base())).toBe('No details yet');
  });

  it('joins only what is known', () => {
    const photo = editPhoto(base(), { widthIn: 24, heightIn: 36, year: 2026 });
    expect(describePhoto(photo)).toBe('24 × 36 in · 2026');
  });
});

describe('shareMessage', () => {
  it('states the price even when there is none', () => {
    expect(shareMessage(base(), null)).toContain('Price on request');
  });

  it('leaves out a size that was never measured', () => {
    expect(shareMessage(base(), null)).not.toContain(' in');
  });

  it('signs off with the studio when there is one', () => {
    expect(shareMessage(base(), 'Bob Dylan')).toContain('— Bob Dylan');
  });

  it('leads with the title', () => {
    expect(shareMessage(base(), null).split('\n')[0]).toBe('Harbour light');
  });
});

describe('status and the current show', () => {
  it('says nothing about a piece nobody has classified', () => {
    expect(describeStatus(base())).toBeNull();
    expect(statusOf(base())).toBeNull();
    expect(isInCurrentShow(base())).toBe(false);
  });

  it('never reads an unstated piece as available', () => {
    expect(describePhoto(base())).not.toContain('Available');
  });

  it('reads back what the artist set', () => {
    expect(describeStatus(editPhoto(base(), { status: 'sold' }))).toBe('Sold');
    expect(describeStatus(editPhoto(base(), { status: 'nfs' }))).toBe('Not for sale');
    expect(describeStatus(editPhoto(base(), { status: 'available' }))).toBe('Available');
  });

  it('treats a photo saved before status existed as unstated', () => {
    const old = { ...base(), status: undefined, inCurrentShow: undefined } as unknown as Parameters<typeof statusOf>[0];
    expect(statusOf(old)).toBeNull();
    expect(isInCurrentShow(old)).toBe(false);
  });

  it('tells a client a piece is sold, and does not brag that one is available', () => {
    expect(shareMessage(editPhoto(base(), { status: 'sold' }), null)).toContain('Sold');
    expect(shareMessage(editPhoto(base(), { status: 'available' }), null)).not.toContain('Available');
  });

  it('shows the status in the line under a thumbnail', () => {
    expect(describePhoto(editPhoto(base(), { status: 'sold' }))).toBe('Sold');
  });
});


describe('isShownToVisitors', () => {
  it('shows a new picture: hiding is something the artist does', () => {
    expect(isShownToVisitors(base())).toBe(true);
  });

  it('hides one the artist took out, without deleting it', () => {
    expect(isShownToVisitors(editPhoto(base(), { hiddenFromVisitors: true }))).toBe(false);
  });

  it('shows a picture stored before hiding existed', () => {
    const older = { ...base() } as Partial<ReturnType<typeof base>>;
    delete older.hiddenFromVisitors;
    expect(isShownToVisitors(older as ReturnType<typeof base>)).toBe(true);
  });
});


describe('an edited picture', () => {
  it('is its own original until an edit is saved', () => {
    const photo = base();
    expect(sourceImageId(photo)).toBe(photo.imageId);
    expect(isEdited(photo)).toBe(false);
  });

  it('keeps the photograph beside what is on show', () => {
    const edited = editPhoto(base(), {
      imageId: 'rendered-1',
      originalImageId: 'img-1',
      edit: { ...neutralAdjustments(), contrast: 20 },
    });
    // What everything else in the app draws.
    expect(edited.imageId).toBe('rendered-1');
    // What the editor works from, so an edit is never applied on top of itself.
    expect(sourceImageId(edited)).toBe('img-1');
    expect(isEdited(edited)).toBe(true);
  });

  it('does not call a set of untouched sliders an edit', () => {
    const photo = editPhoto(base(), { edit: neutralAdjustments() });
    expect(isEdited(photo)).toBe(false);
  });
});
