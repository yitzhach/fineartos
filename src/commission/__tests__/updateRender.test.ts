import { describe, expect, it } from 'vitest';
import { cardFileStem, renderUpdateHtml, type CardContext } from '../updateRender';
import { createUpdate, emptyDraft } from '../updates';

const context: CardContext = {
  studioName: 'Isaac Anderson Studio',
  studioEmail: 'studio@example.com',
  clientName: 'Ruiz Collection',
  title: 'Lobby triptych',
  documentNumber: 'AO-2026-0001',
  date: '2026-03-04',
  stage: 'Work in progress',
};

const update = (over = {}) =>
  createUpdate('doc-1', { ...emptyDraft(), headline: 'Underpainting', note: 'The ground is down.', ...over });

describe('the page', () => {
  it('carries what the update says', () => {
    const html = renderUpdateHtml(update(), context, []);
    expect(html).toContain('Underpainting');
    expect(html).toContain('The ground is down.');
    expect(html).toContain('Lobby triptych');
    expect(html).toContain('March 4, 2026'); // the same date format the invoices use
  });

  it('inlines its pictures, so it opens with no app and no network', () => {
    const html = renderUpdateHtml(update(), context, [
      { src: 'data:image/jpeg;base64,AAAA', title: 'Panel one' },
    ]);
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"');
    expect(html).toContain('Panel one');
  });

  it('offers to reply only when a sign-off was asked for', () => {
    expect(renderUpdateHtml(update(), context, [])).not.toContain('Approve</a>');
    const asking = renderUpdateHtml(update({ asksApproval: true }), context, []);
    expect(asking).toContain('Approve</a>');
    expect(asking).toContain('Ask for a change');
  });

  it('replies through the reader\'s own mail, addressed to the studio', () => {
    const html = renderUpdateHtml(update({ asksApproval: true }), context, []);
    expect(html).toContain('mailto:studio%40example.com');
    expect(html).toContain('Approved');
  });

  it('asks for a reply in words when the studio has no address to send to', () => {
    const html = renderUpdateHtml(update({ asksApproval: true }), { ...context, studioEmail: null }, []);
    // A button that opens a blank email is worse than no button.
    expect(html).not.toContain('Approve</a>');
    expect(html).toContain('reply however you normally reach');
  });

  it('says plainly that it cannot send or watch anything', () => {
    const html = renderUpdateHtml(update(), context, []);
    expect(html).toMatch(/cannot send anything by\s+itself/);
    expect(html).toMatch(/nobody is told whether you opened it/);
  });

  it('escapes what it is given, because a title is typed by a person', () => {
    const html = renderUpdateHtml(update({ headline: '<script>alert(1)</script>' }), context, []);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('the file name', () => {
  it('reads as words, not as an id', () => {
    expect(cardFileStem(update(), context)).toBe('lobby-triptych-underpainting-2026-03-04');
  });

  it('survives a title with punctuation in it', () => {
    expect(cardFileStem(update({ headline: 'Stage 2: "the wall"' }), context)).toBe(
      'lobby-triptych-stage-2-the-wall-2026-03-04',
    );
  });
});
