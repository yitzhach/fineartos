import { describe, expect, it } from 'vitest';
import { createDocument, issueDocument, recordPayment, toClientFacing } from '../document';
import { createMilestone, addMilestone, toggleMilestone } from '../milestones';
import { addTask, board, createTask, removeTask, sortedTasks, stageOf, tasksOf, updateTask } from '../tasks';
import type { CommissionDocument } from '../types';

const now = new Date('2026-10-09T12:00:00Z');
const priced = (price = 100000): CommissionDocument => {
  const doc = createDocument('AO-2026-0001', now);
  const line = doc.quote.lineItems[0]!;
  return { ...doc, quote: { ...doc.quote, lineItems: [{ ...line, unitPrice: price }] } };
};
const pay = (doc: CommissionDocument, amount: number) => recordPayment(doc, { date: '2026-10-01', amount, method: null, note: null } as never, now);

describe('tasks', () => {
  it('add, tick, remove; never client-facing', () => {
    let doc = addTask(priced(), createTask('  Order linen ', '2026-10-12'));
    doc = addTask(doc, createTask('   '));
    expect(tasksOf(doc).map((t) => t.label)).toEqual(['Order linen']);
    const id = tasksOf(doc)[0]!.id;
    doc = updateTask(doc, id, { done: true });
    expect(tasksOf(doc)[0]!.done).toBe(true);
    expect(JSON.stringify(toClientFacing(doc))).not.toContain('Order linen');
    expect(tasksOf(removeTask(doc, id))).toEqual([]);
    expect(tasksOf(createDocument('X', now))).toEqual([]);
  });
  it('open first, soonest first, undated after; done last', () => {
    const a = { ...createTask('a', null) }, b = createTask('b', '2026-10-20'), c = createTask('c', '2026-10-10'), d = { ...createTask('d', '2026-10-01'), done: true };
    expect(sortedTasks([a, b, c, d]).map((t) => t.label)).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('the board', () => {
  it('reads each stage off state, money and milestones', () => {
    const draft = priced();
    expect(stageOf(draft)).toBe('quoting');
    const issued = issueDocument(draft, now);
    expect(stageOf(issued)).toBe('deposit');
    let withStage = addMilestone(pay(issued, 30000), createMilestone('Paint', '2026-10-20'));
    expect(stageOf(withStage)).toBe('making');
    const mId = withStage.schedule.milestones![0]!.id;
    withStage = toggleMilestone(withStage, mId);
    expect(stageOf(withStage)).toBe('balance');
    expect(stageOf(pay(withStage, 70000))).toBe('paid');
    // No milestones: making until paid.
    expect(stageOf(pay(issued, 30000))).toBe('making');
    expect(stageOf(pay(issued, 100000))).toBe('paid');
    expect(stageOf({ ...issued, state: 'archived' })).toBeNull();
  });
  it('every live commission in exactly one column', () => {
    const docs = [priced(), issueDocument(priced(), now), { ...priced(), state: 'archived' as const }];
    const cols = board(docs);
    expect(cols.map((c) => c.docs.length)).toEqual([1, 1, 0, 0, 0]);
  });
});
