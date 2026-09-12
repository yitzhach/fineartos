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
  type GuestDraft,
} from '../guestbook';

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
