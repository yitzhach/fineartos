import { describe, expect, it } from 'vitest';
import { csvCells, newContacts, parseContacts } from '../contactImport';

describe('contact import', () => {
  it('reads vCards, folded lines and all', () => {
    const text = [
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Ruiz;Ana;;;', 'EMAIL;TYPE=HOME:ana@example.com', 'TEL;TYPE=CELL:+1 555 010 2000',
      'NOTE:Met at the fair\\, liked the', '  blue one', 'END:VCARD',
      'BEGIN:VCARD', 'FN:', 'END:VCARD',
    ].join('\r\n');
    const result = parseContacts(text)!;
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toMatchObject({ name: 'Ana Ruiz', email: 'ana@example.com', phone: '+1 555 010 2000', note: 'Met at the fair, liked the blue one' });
    expect(result.skipped).toBe(1);
  });

  it('reads a CSV by its column names', () => {
    const text = 'First Name,Last Name,E-mail Address,Mobile Phone\n"Bo","Chen, Jr",bo@x.com,555\n,,,\n';
    const result = parseContacts(text)!;
    expect(result.contacts[0]).toMatchObject({ name: 'Bo Chen, Jr', email: 'bo@x.com', phone: '555' });
    expect(result.skipped).toBe(1);
  });

  it('refuses a CSV with no column it knows', () => {
    expect(parseContacts('a,b\n1,2')).toBeNull();
  });

  it('splits quoted cells', () => {
    expect(csvCells('"a ""b""",c')).toEqual(['a "b"', 'c']);
  });

  it('leaves out contacts already imported', () => {
    const first = parseContacts('Name,Email\nAna,ana@x.com')!.contacts;
    const again = parseContacts('Name,Email\nAna,ANA@x.com\nBo,bo@x.com')!.contacts;
    expect(newContacts(again, first).map((c) => c.name)).toEqual(['Bo']);
  });
});
