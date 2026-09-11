import { describe, expect, it } from 'vitest';
import { createDocument } from '../document';
import {
  addMilestone,
  createMilestone,
  milestoneProgress,
  milestonesOf,
  removeMilestone,
  toggleMilestone,
  updateMilestone,
  withMilestones,
} from '../milestones';

const doc = () => createDocument('AO-2026-0001');

describe('reading milestones', () => {
  it('treats a document from an older build as having none, not as broken', () => {
    const old = doc();
    // Exactly what a record saved before milestones existed looks like.
    delete (old.schedule as { milestones?: unknown }).milestones;
    expect(milestonesOf(old)).toEqual([]);
    expect(() => milestoneProgress(old)).not.toThrow();
  });
});

describe('editing milestones', () => {
  it('adds one', () => {
    const next = addMilestone(doc(), createMilestone('Concept approved', '2026-04-05'));
    expect(milestonesOf(next)).toHaveLength(1);
    expect(milestonesOf(next)[0]?.label).toBe('Concept approved');
  });

  it('starts a new milestone unfinished', () => {
    expect(createMilestone('Delivery').done).toBe(false);
  });

  it('allows a milestone with no date rather than inventing one', () => {
    expect(createMilestone('Final review').date).toBeNull();
  });

  it('toggles one without touching the others', () => {
    let next = addMilestone(doc(), createMilestone('A'));
    next = addMilestone(next, createMilestone('B'));
    const first = milestonesOf(next)[0]!;
    next = toggleMilestone(next, first.id);
    expect(milestonesOf(next)[0]?.done).toBe(true);
    expect(milestonesOf(next)[1]?.done).toBe(false);
  });

  it('updates a label and a date', () => {
    let next = addMilestone(doc(), createMilestone('Draft'));
    const id = milestonesOf(next)[0]!.id;
    next = updateMilestone(next, id, { label: 'Concept approved', date: '2026-05-01' });
    expect(milestonesOf(next)[0]).toMatchObject({ label: 'Concept approved', date: '2026-05-01' });
  });

  it('removes one', () => {
    let next = addMilestone(doc(), createMilestone('A'));
    next = addMilestone(next, createMilestone('B'));
    next = removeMilestone(next, milestonesOf(next)[0]!.id);
    expect(milestonesOf(next).map((m) => m.label)).toEqual(['B']);
  });

  it('leaves the rest of the schedule alone', () => {
    const start = { ...doc(), schedule: { targetCompletionDate: '2026-06-01', deliveryNotes: 'Hung by studio' } };
    const next = withMilestones(start, [createMilestone('A')]);
    expect(next.schedule.targetCompletionDate).toBe('2026-06-01');
    expect(next.schedule.deliveryNotes).toBe('Hung by studio');
  });
});

describe('progress', () => {
  it('is null with no milestones, because 0% would read as "behind"', () => {
    expect(milestoneProgress(doc()).percent).toBeNull();
  });

  it('counts what is done', () => {
    let next = addMilestone(doc(), createMilestone('A'));
    next = addMilestone(next, createMilestone('B'));
    next = toggleMilestone(next, milestonesOf(next)[0]!.id);
    const progress = milestoneProgress(next);
    expect(progress).toMatchObject({ done: 1, total: 2, percent: 50 });
  });

  it('names the first unfinished stage as the current one', () => {
    let next = addMilestone(doc(), createMilestone('A'));
    next = addMilestone(next, createMilestone('B'));
    next = toggleMilestone(next, milestonesOf(next)[0]!.id);
    expect(milestoneProgress(next).current?.label).toBe('B');
  });

  it('has no current stage once everything is done', () => {
    let next = addMilestone(doc(), createMilestone('A'));
    next = toggleMilestone(next, milestonesOf(next)[0]!.id);
    expect(milestoneProgress(next).current).toBeNull();
    expect(milestoneProgress(next).percent).toBe(100);
  });
});
