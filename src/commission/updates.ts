/**
 * Client updates: what the studio told the client, and what came back.
 *
 * An update is a child record of a commission, like an invoice — never a
 * field on the document. It carries what was said, which stage it was about,
 * which pictures went with it, and every time the artist handed it over.
 *
 * Two rules run through all of it, and they are the same ones the guest book
 * lives by:
 *
 *  - **Nothing claims to have been sent.** This app has no server and no
 *    outbox. What it can honestly record is that the artist saved a file,
 *    copied a message, or handed it to the phone's share sheet — so that is
 *    what a hand-off is. Whether it arrived is not knowable here, and is
 *    never implied.
 *  - **An approval is something that happened.** It is typed in or pasted by
 *    the artist from the client's own reply, or signed in person on the
 *    tablet. It is never inferred from an update having been opened, because
 *    nothing here can know that. Not answered is null, and reads as
 *    "no reply recorded" rather than as a pending anything.
 *
 * DOM-free, like the rest of the model layer.
 */

import { newId } from './document';
import type { Milestone } from './types';

/** The ways an update can leave this app. All of them are the artist acting. */
export type HandoffChannel = 'jpeg' | 'pdf' | 'page' | 'share' | 'copy';

export interface Handoff {
  channel: HandoffChannel;
  at: string;
}

/** What the client said. Null outcome means nothing has been recorded. */
export type ApprovalOutcome = 'approved' | 'changes';

/** How the reply reached the artist. It is always one of these, or nothing. */
export type ApprovalRoute = 'in-person' | 'email' | 'text' | 'call' | 'other';

export interface Approval {
  outcome: ApprovalOutcome;
  /** The client's own words, pasted or typed. Never written for them. */
  words: string | null;
  route: ApprovalRoute | null;
  at: string;
  /** Signed on the tablet, in person. SVG paths, as the guest book stores them. */
  signaturePaths: string[] | null;
}

export interface ClientUpdate {
  id: string;
  /** The commission this belongs to. */
  documentId: string;
  /** The stage it is about, when it is about one. */
  milestoneId: string | null;
  /** The line at the top: usually the stage, sometimes the artist's own. */
  headline: string;
  /** What the artist wrote. Null when they let the pictures speak. */
  note: string | null;
  /** Pictures from the studio, in the order they were picked. */
  photoIds: string[];
  /** Whether this update asked the client to sign the stage off. */
  asksApproval: boolean;
  /** Every time it was handed over, oldest first. */
  handoffs: Handoff[];
  /** What came back, or null while nothing has. */
  approval: Approval | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateDraft {
  milestoneId: string | null;
  headline: string;
  note: string;
  photoIds: string[];
  asksApproval: boolean;
}

export function emptyDraft(): UpdateDraft {
  return { milestoneId: null, headline: '', note: '', photoIds: [], asksApproval: false };
}

/** Why a draft cannot be saved, or null when it can. */
export function draftProblem(draft: UpdateDraft): string | null {
  if (!draft.headline.trim() && !draft.note.trim() && draft.photoIds.length === 0) {
    return 'An update needs a line to say, or a picture to show.';
  }
  return null;
}

/** The headline a stage suggests. The artist can always write their own. */
export function headlineFor(milestone: Milestone | null): string {
  return milestone ? milestone.label : '';
}

export function createUpdate(
  documentId: string,
  draft: UpdateDraft,
  now = new Date(),
): ClientUpdate {
  const iso = now.toISOString();
  return {
    id: newId(),
    documentId,
    milestoneId: draft.milestoneId,
    headline: draft.headline.trim() || 'Progress',
    note: trimmedOrNull(draft.note),
    photoIds: [...draft.photoIds],
    asksApproval: draft.asksApproval,
    handoffs: [],
    approval: null,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function editUpdate(
  update: ClientUpdate,
  changes: Partial<ClientUpdate>,
  now = new Date(),
): ClientUpdate {
  return { ...update, ...changes, id: update.id, updatedAt: now.toISOString() };
}

/**
 * Records that the artist handed the update over. Not that it was sent, and
 * not that it arrived: this app cannot know either, and says so.
 */
export function recordHandoff(
  update: ClientUpdate,
  channel: HandoffChannel,
  now = new Date(),
): ClientUpdate {
  return editUpdate(update, { handoffs: [...update.handoffs, { channel, at: now.toISOString() }] }, now);
}

export function recordApproval(
  update: ClientUpdate,
  approval: Omit<Approval, 'at'> & { at?: string },
  now = new Date(),
): ClientUpdate {
  return editUpdate(update, { approval: { ...approval, at: approval.at ?? now.toISOString() } }, now);
}

/** Takes a recorded reply back off, for when it was put on the wrong update. */
export function clearApproval(update: ClientUpdate, now = new Date()): ClientUpdate {
  return editUpdate(update, { approval: null }, now);
}

export function updatesFor(updates: ClientUpdate[], documentId: string): ClientUpdate[] {
  return updates
    .filter((update) => update.documentId === documentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Updates that asked for a sign-off and have not had one recorded. */
export function awaitingReply(updates: ClientUpdate[]): ClientUpdate[] {
  return updates.filter((update) => update.asksApproval && update.approval === null);
}

/** The last time anything went out, or null when nothing has. */
export function lastHandoffAt(updates: ClientUpdate[]): string | null {
  const times = updates.flatMap((update) => update.handoffs.map((handoff) => handoff.at));
  return times.length === 0 ? null : times.reduce((latest, at) => (at > latest ? at : latest));
}

export function describeChannel(channel: HandoffChannel): string {
  switch (channel) {
    case 'jpeg':
      return 'Saved as a picture';
    case 'pdf':
      return 'Printed or saved as a PDF';
    case 'page':
      return 'Saved as a page';
    case 'share':
      return 'Handed to the share sheet';
    case 'copy':
      return 'Copied as a message';
  }
}

export function describeRoute(route: ApprovalRoute | null): string {
  switch (route) {
    case 'in-person':
      return 'in person';
    case 'email':
      return 'by email';
    case 'text':
      return 'by text';
    case 'call':
      return 'on the phone';
    case 'other':
      return '';
    default:
      return '';
  }
}

/**
 * What the reply line reads. An update nobody was asked to approve says so
 * plainly, and one that was asked but not answered says *that* — never
 * "pending", which would imply something is being waited on by the app.
 */
export function describeApproval(update: ClientUpdate): string {
  if (update.approval) {
    const route = describeRoute(update.approval.route);
    const said = update.approval.outcome === 'approved' ? 'Approved' : 'Changes asked for';
    return route ? `${said} ${route}` : said;
  }
  if (update.asksApproval) return 'No reply recorded';
  return 'No sign-off asked for';
}

/** How many pictures went with it, in words rather than a bare number. */
export function describePictures(count: number): string {
  if (count === 0) return 'No pictures';
  return count === 1 ? '1 picture' : `${count} pictures`;
}

/**
 * The message the artist copies or pastes alongside the file. Only what is
 * actually recorded: an update with no note is a headline and a date, not an
 * invented paragraph.
 */
export function messageFor(
  update: ClientUpdate,
  context: { studioName: string | null; clientName: string | null; title: string | null },
): string {
  const lines: string[] = [];
  const first = context.clientName?.trim().split(/\s+/)[0];
  lines.push(first ? `Hi ${first},` : 'Hi,');
  lines.push('');
  lines.push(context.title ? `${context.title} — ${update.headline}` : update.headline);
  if (update.note) {
    lines.push('');
    lines.push(update.note);
  }
  if (update.asksApproval) {
    lines.push('');
    lines.push('Happy for me to carry on from here? A yes by reply is enough.');
  }
  if (context.studioName?.trim()) {
    lines.push('');
    lines.push(`— ${context.studioName.trim()}`);
  }
  return lines.join('\n');
}

// --- The timeline -----------------------------------------------------------

export type TimelineKind = 'update' | 'handoff' | 'reply' | 'invoice' | 'stage';

export interface TimelineRow {
  id: string;
  kind: TimelineKind;
  at: string;
  label: string;
  detail: string | null;
}

/**
 * Everything that has passed between studio and client, newest first.
 *
 * Built from records rather than kept as its own log: a log would be a second
 * copy of the truth, and the two would disagree the first time something was
 * deleted.
 */
export function timelineFor(input: {
  updates: ClientUpdate[];
  milestones: Milestone[];
  invoices: { id: string; number: string; issuedAt: string | null }[];
}): TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (const update of input.updates) {
    rows.push({
      id: `update:${update.id}`,
      kind: 'update',
      at: update.createdAt,
      label: update.headline,
      detail: update.note,
    });
    for (const [index, handoff] of update.handoffs.entries()) {
      rows.push({
        id: `handoff:${update.id}:${index}`,
        kind: 'handoff',
        at: handoff.at,
        label: describeChannel(handoff.channel),
        detail: update.headline,
      });
    }
    if (update.approval) {
      rows.push({
        id: `reply:${update.id}`,
        kind: 'reply',
        at: update.approval.at,
        label: describeApproval(update),
        detail: update.approval.words,
      });
    }
  }

  for (const invoice of input.invoices) {
    if (!invoice.issuedAt) continue;
    rows.push({
      id: `invoice:${invoice.id}`,
      kind: 'invoice',
      at: invoice.issuedAt,
      label: `Invoice ${invoice.number} issued`,
      detail: null,
    });
  }

  for (const milestone of input.milestones) {
    // A stage with no date is a plan, not something that happened.
    if (!milestone.done || !milestone.date) continue;
    rows.push({
      id: `stage:${milestone.id}`,
      kind: 'stage',
      at: `${milestone.date}T00:00:00.000Z`,
      label: `${milestone.label} — done`,
      detail: null,
    });
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
