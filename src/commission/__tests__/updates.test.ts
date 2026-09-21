import { describe, expect, it } from 'vitest';
import {
  awaitingReply,
  clearApproval,
  createUpdate,
  describeApproval,
  describeChannel,
  describePictures,
  draftForMilestone,
  draftProblem,
  emptyDraft,
  headlineFor,
  lastHandoffAt,
  toldAbout,
  messageFor,
  recordApproval,
  recordHandoff,
  timelineFor,
  updatesFor,
} from '../updates';
import { createMilestone } from '../milestones';

const at = (iso: string) => new Date(iso);
const draft = (over = {}) => ({ ...emptyDraft(), headline: 'Underpainting', ...over });

describe('making one', () => {
  it('needs something to say or something to show', () => {
    expect(draftProblem(emptyDraft())).toMatch(/line to say/);
    expect(draftProblem(draft())).toBeNull();
    expect(draftProblem({ ...emptyDraft(), photoIds: ['p1'] })).toBeNull();
    expect(draftProblem({ ...emptyDraft(), note: 'Nearly there.' })).toBeNull();
  });

  it('starts with nothing handed over and nothing said back', () => {
    const update = createUpdate('doc-1', draft(), at('2026-03-01T10:00:00Z'));
    expect(update.handoffs).toEqual([]);
    expect(update.approval).toBeNull();
    expect(update.documentId).toBe('doc-1');
  });

  it('takes its headline from a stage when there is one', () => {
    expect(headlineFor(createMilestone('Final review'))).toBe('Final review');
    expect(headlineFor(null)).toBe('');
  });

  it('falls back to a plain word rather than an empty heading', () => {
    const update = createUpdate('doc-1', { ...emptyDraft(), photoIds: ['p1'] });
    expect(update.headline).toBe('Progress');
  });
});

describe('handing it over', () => {
  it('records what the artist did, not that anything was sent', () => {
    let update = createUpdate('doc-1', draft(), at('2026-03-01T10:00:00Z'));
    update = recordHandoff(update, 'jpeg', at('2026-03-01T10:05:00Z'));
    update = recordHandoff(update, 'copy', at('2026-03-01T10:06:00Z'));
    expect(update.handoffs.map((h) => h.channel)).toEqual(['jpeg', 'copy']);
    expect(describeChannel('jpeg')).toBe('Saved as a picture');
    expect(describeChannel('share')).toBe('Handed to the share sheet');
  });

  it('knows when anything last went out', () => {
    const bare = createUpdate('doc-1', draft());
    expect(lastHandoffAt([bare])).toBeNull();
    const sent = recordHandoff(bare, 'pdf', at('2026-03-02T09:00:00Z'));
    expect(lastHandoffAt([bare, sent])).toBe('2026-03-02T09:00:00.000Z');
  });
});

describe('what came back', () => {
  it('says no reply recorded rather than pending', () => {
    const asked = createUpdate('doc-1', draft({ asksApproval: true }));
    expect(describeApproval(asked)).toBe('No reply recorded');
  });

  it('says plainly when nobody was asked', () => {
    expect(describeApproval(createUpdate('doc-1', draft()))).toBe('No sign-off asked for');
  });

  it('records the client\'s own words and how they arrived', () => {
    const asked = createUpdate('doc-1', draft({ asksApproval: true }));
    const answered = recordApproval(
      asked,
      { outcome: 'approved', words: 'Looks wonderful, go ahead.', route: 'email', signaturePaths: null },
      at('2026-03-03T12:00:00Z'),
    );
    expect(answered.approval?.words).toBe('Looks wonderful, go ahead.');
    expect(answered.approval?.at).toBe('2026-03-03T12:00:00.000Z');
    expect(describeApproval(answered)).toBe('Approved by email');
  });

  it('handles a change request the same way', () => {
    const answered = recordApproval(createUpdate('doc-1', draft({ asksApproval: true })), {
      outcome: 'changes',
      words: 'Could the sky be warmer?',
      route: 'text',
      signaturePaths: null,
    });
    expect(describeApproval(answered)).toBe('Changes asked for by text');
  });

  it('can be taken back off when it was put on the wrong update', () => {
    const answered = recordApproval(createUpdate('doc-1', draft({ asksApproval: true })), {
      outcome: 'approved',
      words: null,
      route: 'call',
      signaturePaths: null,
    });
    expect(clearApproval(answered).approval).toBeNull();
  });

  it('lists what is still unanswered, and only what was asked', () => {
    const asked = createUpdate('doc-1', draft({ asksApproval: true }));
    const notAsked = createUpdate('doc-1', draft());
    const answered = recordApproval(createUpdate('doc-1', draft({ asksApproval: true })), {
      outcome: 'approved',
      words: null,
      route: 'email',
      signaturePaths: null,
    });
    expect(awaitingReply([asked, notAsked, answered])).toEqual([asked]);
  });
});

describe('the message', () => {
  it('says only what is recorded', () => {
    const update = createUpdate('doc-1', draft({ note: 'The ground is down.' }));
    const text = messageFor(update, {
      studioName: 'Isaac Anderson Studio',
      clientName: 'Ruiz Collection',
      title: 'Lobby triptych',
    });
    expect(text).toContain('Hi Ruiz,');
    expect(text).toContain('Lobby triptych — Underpainting');
    expect(text).toContain('The ground is down.');
    expect(text).toContain('— Isaac Anderson Studio');
    expect(text).not.toMatch(/approve/i);
  });

  it('asks for a sign-off only when one was asked for', () => {
    const update = createUpdate('doc-1', draft({ asksApproval: true }));
    expect(messageFor(update, { studioName: null, clientName: null, title: null })).toMatch(
      /carry on from here/,
    );
  });
});

describe('the timeline', () => {
  it('puts everything in one order, newest first', () => {
    let update = createUpdate('doc-1', draft(), at('2026-03-01T10:00:00Z'));
    update = recordHandoff(update, 'jpeg', at('2026-03-01T11:00:00Z'));
    update = recordApproval(
      update,
      { outcome: 'approved', words: 'Yes.', route: 'email', signaturePaths: null },
      at('2026-03-04T08:00:00Z'),
    );

    const rows = timelineFor({
      updates: [update],
      milestones: [{ ...createMilestone('Concept approved', '2026-03-02'), done: true }],
      invoices: [{ id: 'inv-1', number: 'AO-2026-0001', issuedAt: '2026-03-03T09:00:00Z' }],
    });

    expect(rows.map((row) => row.kind)).toEqual(['reply', 'invoice', 'stage', 'handoff', 'update']);
    expect(rows[0]!.detail).toBe('Yes.');
  });

  it('leaves out a stage that has not happened and an invoice never issued', () => {
    const rows = timelineFor({
      updates: [],
      milestones: [createMilestone('Delivery', '2026-06-01'), { ...createMilestone('Framing'), done: true }],
      invoices: [{ id: 'inv-2', number: 'AO-2026-0002', issuedAt: null }],
    });
    expect(rows).toEqual([]);
  });
});

describe('housekeeping', () => {
  it('keeps one commission\'s updates apart from another\'s', () => {
    const mine = createUpdate('doc-1', draft(), at('2026-03-01T10:00:00Z'));
    const theirs = createUpdate('doc-2', draft(), at('2026-03-02T10:00:00Z'));
    expect(updatesFor([mine, theirs], 'doc-1')).toEqual([mine]);
  });

  it('counts pictures in words', () => {
    expect(describePictures(0)).toBe('No pictures');
    expect(describePictures(1)).toBe('1 picture');
    expect(describePictures(4)).toBe('4 pictures');
  });
});

describe('an update offered by a finished stage', () => {
  const stage = { id: 'm1', label: 'Underpainting', date: '2026-03-04', done: true };

  it('fills in the stage and its name, and nothing else', () => {
    const draft = draftForMilestone(stage);
    expect(draft.milestoneId).toBe('m1');
    expect(draft.headline).toBe('Underpainting');
    expect(draft.note).toBe('');
    expect(draft.photoIds).toEqual([]);
  });

  it('never assumes a sign-off is being asked for', () => {
    expect(draftForMilestone(stage).asksApproval).toBe(false);
  });

  it('is a saveable draft as it stands', () => {
    expect(draftProblem(draftForMilestone(stage))).toBeNull();
  });

  it('knows when the client has already been told about a stage', () => {
    const told = createUpdate('doc-1', { ...draftForMilestone(stage) });
    expect(toldAbout([told], 'm1')?.headline).toBe('Underpainting');
    expect(toldAbout([told], 'm2')).toBeNull();
    expect(toldAbout([], 'm1')).toBeNull();
  });
});
