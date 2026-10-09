/**
 * Private tasks on a commission, and the board of commissions by stage.
 * DOM-free.
 *
 * The stage is read, never stored — like the status pill, it is worked out
 * from the document's state, its money and its milestones, so the board
 * cannot disagree with the records it is drawn from.
 */
import { newId } from './document';
import { calculateTotals } from './calc';
import { milestoneProgress } from './milestones';
import type { CommissionDocument, CommissionTask } from './types';

export function tasksOf(doc: CommissionDocument): CommissionTask[] {
  return doc.tasks ?? [];
}

export function createTask(label: string, due: string | null = null): CommissionTask {
  return { id: newId(), label: label.trim(), due, done: false };
}

export function withTasks(doc: CommissionDocument, tasks: CommissionTask[]): CommissionDocument {
  return { ...doc, tasks };
}

export function addTask(doc: CommissionDocument, task: CommissionTask): CommissionDocument {
  if (!task.label) return doc;
  return withTasks(doc, [...tasksOf(doc), task]);
}

export function updateTask(doc: CommissionDocument, id: string, changes: Partial<Omit<CommissionTask, 'id'>>): CommissionDocument {
  return withTasks(doc, tasksOf(doc).map((t) => (t.id === id ? { ...t, ...changes } : t)));
}

export function removeTask(doc: CommissionDocument, id: string): CommissionDocument {
  return withTasks(doc, tasksOf(doc).filter((t) => t.id !== id));
}

/** Open first (soonest due first, undated last), then done. */
export function sortedTasks(tasks: CommissionTask[]): CommissionTask[] {
  return [...tasks].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
      a.label.localeCompare(b.label),
  );
}

export type Stage = 'quoting' | 'deposit' | 'making' | 'balance' | 'paid';

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: 'quoting', label: 'Quoting', hint: 'Drafts not yet issued' },
  { id: 'deposit', label: 'Waiting on deposit', hint: 'Issued, nothing received' },
  { id: 'making', label: 'Making', hint: 'Money in, work under way' },
  { id: 'balance', label: 'Finished, balance due', hint: 'Every stage done, money still owed' },
  { id: 'paid', label: 'Paid in full', hint: 'Nothing owed, nothing left to make' },
];

/** Where a commission stands. Null for an archived one: it is off the board. */
export function stageOf(doc: CommissionDocument): Stage | null {
  if (doc.state === 'archived') return null;
  if (doc.state === 'draft') return 'quoting';
  const { paid, balance } = calculateTotals(doc.quote, doc.payments, doc.deposit);
  const progress = milestoneProgress(doc);
  if (paid <= 0) return 'deposit';
  const unfinished = progress.total > 0 ? progress.done < progress.total : balance > 0;
  if (unfinished) return 'making';
  return balance > 0 ? 'balance' : 'paid';
}

export function board(docs: CommissionDocument[]): { stage: Stage; docs: CommissionDocument[] }[] {
  return STAGES.map(({ id }) => ({
    stage: id,
    docs: docs.filter((doc) => stageOf(doc) === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }));
}
