/**
 * The demo record.
 *
 * A brand new install has nothing in it, and an empty desktop teaches the
 * artist nothing about what the app does. So one commission is seeded on the
 * very first run — and it is marked `isDemo`, labelled DEMO everywhere it
 * appears, and removable in one click.
 *
 * The rules this follows, which are the point:
 *  - It is seeded exactly once, tracked by a flag in localStorage. Deleting it
 *    does not bring it back on the next reload.
 *  - The client is obviously not a real person, and the figures are round.
 *    Nothing here should ever be mistaken for the artist's own work.
 *  - It is a real record through the normal model functions, not a special
 *    case the UI has to know about. It edits, invoices and prints like any
 *    other commission, because it is one.
 *  - Its one image is drawn on a canvas here rather than shipped as a file,
 *    so the app carries no stock photograph of someone else's art, and the
 *    image goes through the same store and the same type and size checks as
 *    anything the artist adds themselves.
 */

import { createDocument, newId } from '../commission/document';
import { createMilestone } from '../commission/milestones';
import type { CommissionDocument } from '../commission/types';
import { addDocumentToProject, createProject, setProjectCover, type Project } from '../project/project';

const SEEDED_KEY = 'artistOS.demoSeeded';

export function demoAlreadySeeded(): boolean {
  try {
    return localStorage.getItem(SEEDED_KEY) === 'true';
  } catch {
    // With site data blocked we cannot remember, so we do not seed at all
    // rather than re-seed a demo on every single load.
    return true;
  }
}

export function markDemoSeeded(): void {
  try {
    localStorage.setItem(SEEDED_KEY, 'true');
  } catch {
    /* preferences are a convenience, not a requirement */
  }
}

export interface DemoContent {
  document: CommissionDocument;
  project: Project;
}

export function buildDemo(now = new Date()): DemoContent {
  const year = now.getFullYear();
  const base = createDocument(`AO-${year}-0001`, now);

  const document: CommissionDocument = {
    ...base,
    isDemo: true,
    title: 'Harbour triptych',
    client: {
      name: 'Sample Client',
      email: 'client@example.com',
      phone: null,
      billingAddress: null,
      projectAddress: 'Living room · Austin, TX',
      source: 'Spring art fair',
    },
    artwork: {
      ...base.artwork,
      description: 'Three panels, cement and plaster on board, hung as one piece.',
      width: 68,
      height: 48,
      depth: 2,
      unit: 'in',
      materials: 'Cement, plaster, steel',
      finish: 'Matte sealed',
      referenceImageIds: [],
    },
    schedule: {
      targetCompletionDate: iso(addMonths(now, 2)),
      deliveryNotes: 'Delivered and hung by the studio.',
      // Two done, three ahead — enough to show what the list is for.
      milestones: [
        { ...createMilestone('Concept approved', iso(addDays(now, -14))), done: true },
        { ...createMilestone('Materials purchased', iso(addDays(now, -7))), done: true },
        createMilestone('Work in progress', iso(addDays(now, 7))),
        createMilestone('Final review', iso(addMonths(now, 1))),
        createMilestone('Delivery', iso(addMonths(now, 2))),
      ],
    },
    quote: {
      currency: 'USD',
      taxRatePct: null,
      lineItems: [
        { id: newId(), kind: 'artwork', description: 'Triptych, 68 × 48 in', quantity: 1, unitPrice: 480000 },
        { id: newId(), kind: 'delivery', description: 'Crating and delivery', quantity: 1, unitPrice: 40000 },
      ],
    },
    deposit: { kind: 'percent', value: 50 },
    payments: [{ id: newId(), date: iso(now), amount: 260000, note: 'Deposit received' }],
    terms: {
      body: 'Half on commissioning, half before delivery.',
      revisionAllowance: 'One round of revisions at the concept stage.',
      cancellation: null,
    },
    privateNotes: 'This is the demo record. Delete it whenever you like.',
  };

  let project = createProject('Harbour triptych', 'Sample Client', now);
  project = addDocumentToProject(project, document.id, now);
  project = setProjectCover(project, null, now);

  return { document, project };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Draws the demo artwork: a plaster panel in warm neutrals. Deliberately
 * abstract — it stands in for a photograph without pretending to be one.
 *
 * Returns null when the browser gives no 2D context or cannot encode a PNG,
 * in which case the demo simply has no image and the overview says so.
 */
export function drawDemoArtwork(): Promise<Blob | null> {
  const W = 900;
  const H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);

  const wall = ctx.createLinearGradient(0, 0, W * 0.4, H);
  wall.addColorStop(0, '#e9e0d2');
  wall.addColorStop(0.55, '#ded3c1');
  wall.addColorStop(1, '#c9bca6');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // Light raking across the wall from the upper left.
  const light = ctx.createRadialGradient(W * 0.2, -H * 0.1, 40, W * 0.2, -H * 0.1, H * 1.5);
  light.addColorStop(0, 'rgba(255,252,245,0.85)');
  light.addColorStop(1, 'rgba(255,252,245,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);

  // The panel itself, with a cast shadow so it reads as hung on the wall.
  const px = W * 0.16;
  const py = H * 0.17;
  const pw = W * 0.68;
  const ph = H * 0.6;

  ctx.save();
  ctx.shadowColor = 'rgba(60,48,34,0.34)';
  ctx.shadowBlur = 38;
  ctx.shadowOffsetY = 20;
  const panel = ctx.createLinearGradient(px, py, px + pw, py + ph);
  panel.addColorStop(0, '#f0e7d9');
  panel.addColorStop(0.5, '#e3d7c4');
  panel.addColorStop(1, '#cdbfa8');
  ctx.fillStyle = panel;
  ctx.fillRect(px, py, pw, ph);
  ctx.restore();

  // Crackle: a wandering network of hairline fissures, as cement dries.
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ctx.lineCap = 'round';
  let seed = 20260911;
  const rand = () => {
    // Deterministic, so the demo looks the same on every device.
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 54; i += 1) {
    let x = px + rand() * pw;
    let y = py + rand() * ph;
    let angle = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 4 + Math.floor(rand() * 7);
    for (let j = 0; j < segments; j += 1) {
      angle += (rand() - 0.5) * 1.5;
      const length = 16 + rand() * 52;
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(110, 94, 72, ${0.10 + rand() * 0.20})`;
    ctx.lineWidth = 0.6 + rand() * 1.5;
    ctx.stroke();
  }
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
