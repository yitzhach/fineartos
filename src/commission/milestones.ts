/**
 * Production milestones.
 *
 * Small enough to build properly rather than mock: a stage, a date the artist
 * chose, and whether it is done. DOM-free like the rest of the model.
 *
 * `schedule.milestones` is optional because a document saved by an earlier
 * build does not have it. Every function here reads through `milestonesOf`,
 * so a missing list is an empty list and never a crash.
 */

import { newId } from './document';
import type { CommissionDocument, Milestone } from './types';

export function milestonesOf(doc: CommissionDocument): Milestone[] {
  return doc.schedule.milestones ?? [];
}

export function createMilestone(label: string, date: string | null = null): Milestone {
  return { id: newId(), label, date, done: false };
}

/** The stages most commissions go through, offered when a project has none. */
export const SUGGESTED_STAGES = [
  'Concept approved',
  'Materials purchased',
  'Work in progress',
  'Final review',
  'Delivery',
];

export function withMilestones(doc: CommissionDocument, milestones: Milestone[]): CommissionDocument {
  return { ...doc, schedule: { ...doc.schedule, milestones } };
}

export function addMilestone(doc: CommissionDocument, milestone: Milestone): CommissionDocument {
  return withMilestones(doc, [...milestonesOf(doc), milestone]);
}

export function updateMilestone(
  doc: CommissionDocument,
  id: string,
  changes: Partial<Omit<Milestone, 'id'>>,
): CommissionDocument {
  return withMilestones(
    doc,
    milestonesOf(doc).map((m) => (m.id === id ? { ...m, ...changes } : m)),
  );
}

export function removeMilestone(doc: CommissionDocument, id: string): CommissionDocument {
  return withMilestones(doc, milestonesOf(doc).filter((m) => m.id !== id));
}

export function toggleMilestone(doc: CommissionDocument, id: string): CommissionDocument {
  return withMilestones(
    doc,
    milestonesOf(doc).map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
  );
}

export interface MilestoneProgress {
  done: number;
  total: number;
  /** Null when there are no milestones — not 0%, which would read as "behind". */
  percent: number | null;
  /** The first unfinished stage, which is what the artist is actually on. */
  current: Milestone | null;
}

export function milestoneProgress(doc: CommissionDocument): MilestoneProgress {
  const milestones = milestonesOf(doc);
  const done = milestones.filter((m) => m.done).length;
  return {
    done,
    total: milestones.length,
    percent: milestones.length === 0 ? null : Math.round((done / milestones.length) * 100),
    current: milestones.find((m) => !m.done) ?? null,
  };
}
