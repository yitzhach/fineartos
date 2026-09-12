import { describe, expect, it } from 'vitest';
import {
  addEntry,
  csvOf,
  draftProblem,
  emptyDraft,
  looksLikeEmail,
  mailingList,
  mailtoLink,
  possibleDuplicates,
  removeGuest,
  searchGuests,
  signGuestBook,
  smsLink,
  togglePhotoLike,
  hasSignature,
  pathFromPoints,
  likedOf,
  likeCounts,
  type GuestDraft,
  type GuestEntry,
} from '../guestbook';

/** A named helper so the picture tests read plainly. */
const draft0 = (): GuestDraft => ({ ...emptyDraft(), name: 'Ada Lovelace' });

function draft(over: Partial<GuestDraft> = {}): GuestDraft {
  return { ...emptyDraft(), name: 'Ada Lovelace', ...over };
}

describe('draftProblem', () => {
  it('needs a name and nothing else', () => {
    expect(draftProblem(draft())).toBeNull();
  });

  it('refuses a blank row', () => {
    expect(draftProblem(draft({ name: '  ' }))).toContain('name is needed');
  });

  it('catches a typed email that cannot be right', () => {
    expect(draftProblem(draft({ email: 'ada at example' }))).toContain('does not look right');
  });

  it('accepts no email at all', () => {
    expect(draftProblem(draft({ email: '' }))).toBeNull();
  });
});

describe('looksLikeEmail', () => {
  it('accepts an ordinary address', () => {
    expect(looksLikeEmail('ada@example.com')).toBe(true);
  });

  it('accepts an address with a plus tag', () => {
    expect(looksLikeEmail('ada+shows@example.co.uk')).toBe(true);
  });

  it('rejects one with no domain', () => {
    expect(looksLikeEmail('ada@example')).toBe(false);
  });
});

describe('signGuestBook', () => {
  it('keeps blanks as unknown rather than empty strings', () => {
    const entry = signGuestBook(draft());
    expect(entry.email).toBeNull();
    expect(entry.phone).toBeNull();
    expect(entry.note).toBeNull();
  });

  it('records consent exactly as given', () => {
    expect(signGuestBook(draft()).consented).toBe(false);
    expect(signGuestBook(draft({ consented: true })).consented).toBe(true);
  });

  it('trims what it stores', () => {
    expect(signGuestBook(draft({ name: '  Ada  ' })).name).toBe('Ada');
  });
});

describe('the list', () => {
  const ada = signGuestBook(draft({ email: 'ada@example.com', consented: true }));
  const grace = signGuestBook(draft({ name: 'Grace Hopper', phone: '(512) 555-0100' }));

  it('puts the newest signature on top', () => {
    expect(addEntry([ada], grace).map((e) => e.name)).toEqual(['Grace Hopper', 'Ada Lovelace']);
  });

  it('removes one without touching the rest', () => {
    expect(removeGuest([ada, grace], ada.id)).toEqual([grace]);
  });

  it('searches name, email, phone and note alike', () => {
    expect(searchGuests([ada, grace], 'hopper')).toEqual([grace]);
    expect(searchGuests([ada, grace], 'ada@')).toEqual([ada]);
  });

  it('returns everything for an empty search', () => {
    expect(searchGuests([ada, grace], '  ')).toHaveLength(2);
  });
});

describe('mailingList', () => {
  it('is only the people who said yes and left an address', () => {
    const yes = signGuestBook(draft({ email: 'ada@example.com', consented: true }));
    const noConsent = signGuestBook(draft({ email: 'grace@example.com' }));
    const noEmail = signGuestBook(draft({ consented: true }));
    expect(mailingList([yes, noConsent, noEmail])).toEqual([yes]);
  });
});

describe('possibleDuplicates', () => {
  it('spots the same email signing twice', () => {
    const first = signGuestBook(draft({ email: 'ada@example.com' }));
    const again = signGuestBook(draft({ email: 'ADA@example.com' }));
    expect(possibleDuplicates([first], again)).toEqual([first]);
  });

  it('spots the same phone written differently', () => {
    const first = signGuestBook(draft({ phone: '512-555-0100' }));
    const again = signGuestBook(draft({ phone: '(512) 555 0100' }));
    expect(possibleDuplicates([first], again)).toEqual([first]);
  });

  it('does not call two people with the same name a duplicate', () => {
    const first = signGuestBook(draft({ name: 'John Smith' }));
    const other = signGuestBook(draft({ name: 'John Smith' }));
    expect(possibleDuplicates([first], other)).toEqual([]);
  });
});

describe('csvOf', () => {
  const entry = signGuestBook(draft({ email: 'ada@example.com', note: 'Liked the "big" one' }));

  it('quotes a note containing quotes', () => {
    expect(csvOf([entry])).toContain('"Liked the ""big"" one"');
  });

  it('says plainly whether contact was agreed to', () => {
    expect(csvOf([entry])).toContain('"no"');
  });

  it('defuses a cell a spreadsheet would run as a formula', () => {
    const risky = signGuestBook(draft({ name: '=HYPERLINK("http://x")' }));
    expect(csvOf([risky])).toContain(`"'=HYPERLINK`);
  });

  it('has a header even with no entries', () => {
    expect(csvOf([]).split('\r\n')).toHaveLength(1);
  });
});

describe('links out to the phone', () => {
  it('builds a mailto with the subject and body escaped', () => {
    const link = mailtoLink('ada@example.com', 'Your piece', 'Two lines\nhere');
    expect(link).toContain('mailto:ada%40example.com');
    expect(link).toContain('subject=Your%20piece');
    expect(link).toContain('%0A');
  });

  it('uses & for an iPhone and ? elsewhere', () => {
    expect(smsLink('512-555-0100', 'hi', true)).toBe('sms:5125550100&body=hi');
    expect(smsLink('512-555-0100', 'hi', false)).toBe('sms:5125550100?body=hi');
  });

  it('keeps a leading + on an international number', () => {
    expect(smsLink('+44 20 7946 0018', 'hi', false)).toContain('sms:+442079460018');
  });
});

describe('pictures a visitor liked', () => {
  it('starts with none picked', () => {
    expect(emptyDraft().likedPhotoIds).toEqual([]);
  });

  it('toggles a picture on and off again', () => {
    let draft = togglePhotoLike(draft0(), 'photo-1');
    expect(draft.likedPhotoIds).toEqual(['photo-1']);
    draft = togglePhotoLike(draft, 'photo-1');
    expect(draft.likedPhotoIds).toEqual([]);
  });

  it('keeps the picks on the signed entry', () => {
    const entry = signGuestBook(togglePhotoLike(draft0(), 'photo-1'));
    expect(likedOf(entry)).toEqual(['photo-1']);
  });

  it('reads an entry signed before pictures could be picked as none', () => {
    const old = { ...signGuestBook(draft0()), likedPhotoIds: undefined } as unknown as GuestEntry;
    expect(likedOf(old)).toEqual([]);
  });

  it('counts the most liked picture first', () => {
    const a = signGuestBook({ ...draft0(), likedPhotoIds: ['p1', 'p2'] });
    const b = signGuestBook({ ...draft0(), likedPhotoIds: ['p2'] });
    expect(likeCounts([a, b])).toEqual([
      { photoId: 'p2', count: 2 },
      { photoId: 'p1', count: 1 },
    ]);
  });

  it('counts nothing when nobody picked anything', () => {
    expect(likeCounts([signGuestBook(draft0())])).toEqual([]);
  });

  it('writes the titles, not the ids, into the CSV', () => {
    const entry = signGuestBook({ ...draft0(), likedPhotoIds: ['p1'] });
    expect(csvOf([entry], (id) => (id === 'p1' ? 'Harbour light' : id))).toContain('"Harbour light"');
  });
});

describe('signing by hand', () => {
  it('is empty until somebody draws', () => {
    expect(emptyDraft().signaturePaths).toEqual([]);
    expect(hasSignature(signGuestBook(draft0()))).toBe(false);
  });

  it('stores null rather than an empty list when nobody signed', () => {
    expect(signGuestBook(draft0()).signaturePaths).toBeNull();
  });

  it('keeps the strokes that were drawn', () => {
    const entry = signGuestBook({ ...draft0(), signaturePaths: ['M0 0L10 10'] });
    expect(entry.signaturePaths).toEqual(['M0 0L10 10']);
    expect(hasSignature(entry)).toBe(true);
  });

  it('draws a tap as a dot, not as nothing', () => {
    expect(pathFromPoints([{ x: 5, y: 6 }])).toBe('M5 6l0 0');
  });

  it('joins a stroke into one path', () => {
    expect(pathFromPoints([{ x: 0, y: 0 }, { x: 4, y: 2 }, { x: 8, y: 0 }])).toBe('M0 0L4 2L8 0');
  });

  it('rounds to a quarter pixel rather than storing long floats', () => {
    expect(pathFromPoints([{ x: 1.03125, y: 2.9999 }])).toBe('M1 3l0 0');
  });

  it('has nothing to draw for an empty stroke', () => {
    expect(pathFromPoints([])).toBeNull();
  });

  it('reads an entry signed before this existed as unsigned', () => {
    const old = { ...signGuestBook(draft0()), signaturePaths: undefined } as unknown as GuestEntry;
    expect(hasSignature(old)).toBe(false);
  });
});
