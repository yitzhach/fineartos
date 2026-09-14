import { useState, type ReactNode } from 'react';
import { calculateTotals, formatMoney } from '../calc';
import type { CommissionDocument, Milestone } from '../types';
import type { Invoice } from '../../invoice/types';
import { ImageDrop } from '../../os/ImageDrop';
import {
  createMilestone,
  milestoneProgress,
  milestonesOf,
  SUGGESTED_STAGES,
} from '../milestones';

export type ProjectTab =
  | 'overview'
  | 'details'
  | 'document'
  | 'files'
  | 'milestones'
  | 'invoices'
  | 'updates'
  | 'notes';

interface Props {
  doc: CommissionDocument;
  invoices: Invoice[];
  imageUrls: Record<string, string>;
  imageError: string | null;
  tab: ProjectTab;
  onTab: (tab: ProjectTab) => void;
  onChange: (changes: Partial<CommissionDocument>) => void;
  onDocChange: (doc: CommissionDocument) => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (id: string) => void;

  onNewInvoice: () => void;
  onOpenInvoice: (id: string) => void;
  onRemoveDemo?: () => void;
  /** The full editor, rendered in the Details tab. */
  editorSlot: ReactNode;
  /** The client-facing document, rendered in the Document tab. */
  documentSlot: ReactNode;
  /** Client updates and the timeline, rendered in the Updates tab. */
  updatesSlot: ReactNode;
  /** How many updates asked for a sign-off and have no reply recorded. */
  updatesWaiting: number;
}

const NO_DEPOSIT = { kind: 'percent' as const, value: null };

/** "Apr 5, 2026". */
function shortDate(iso: string | null): string {
  if (!iso) return 'No date';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * The project, as the artist works on it: a summary, the stages of making it,
 * the files, the invoices and the private notes, behind tabs.
 *
 * Everything shown is from the record. The status pill reads the document's
 * own state and the milestones; it is not a separate field that could drift
 * out of step with what is actually true.
 */
export function ProjectWindow(props: Props) {
  const { doc, invoices, imageUrls, tab } = props;
  const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
  const money = (amount: number | null) => formatMoney(amount, doc.quote.currency);
  const images = doc.artwork.referenceImageIds;
  const progress = milestoneProgress(doc);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const shownImage = selectedImage && images.includes(selectedImage) ? selectedImage : images[0] ?? null;

  const tabs: { id: ProjectTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'document', label: 'Document' },
    { id: 'files', label: 'Files', count: images.length },
    { id: 'milestones', label: 'Milestones', count: progress.total },
    { id: 'invoices', label: 'Invoices', count: invoices.length },
    { id: 'updates', label: 'Client', count: props.updatesWaiting || undefined },
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <div className="project">
      {doc.isDemo && (
        <div className="demo-banner">
          <span>
            <strong>Demo record.</strong> Seeded once so the app opens with something in it.
            Edit it, or remove it — it will not come back.
          </span>
          {props.onRemoveDemo && (
            <button className="btn" data-variant="quiet" onClick={props.onRemoveDemo}>
              Remove demo
            </button>
          )}
        </div>
      )}

      <header className="pj-head">
        <div className="pj-id">
          <h2>{doc.title.trim() || doc.documentNumber}</h2>
          <p>
            <span className="k">Client</span>
            <span>{doc.client.name.trim() || 'Not set'}</span>
            {doc.client.projectAddress && (
              <>
                <span className="bar" aria-hidden="true">|</span>
                <span>{doc.client.projectAddress}</span>
              </>
            )}
          </p>
        </div>

        {/* The status is read, not stored: a second status field would be one
            more thing that can disagree with the document. */}
        <span className="pj-status" data-state={doc.state}>
          <span className="dot" aria-hidden="true" />
          {statusLabel(doc, progress.current)}
        </span>
      </header>

      <nav className="pj-tabs" aria-label="Project sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            aria-current={tab === item.id}
            onClick={() => props.onTab(item.id)}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && <em>{item.count}</em>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="pj-overview">
          <div className="pj-hero">
            {shownImage && imageUrls[shownImage] ? (
              <img src={imageUrls[shownImage]} alt="" />
            ) : (
              <div className="pj-hero-empty">
                <span className="sheet-face" aria-hidden="true" />
                <p>No image yet</p>
                <button className="btn" onClick={() => props.onTab('files')}>Add files</button>
              </div>
            )}
          </div>

          <section className="pj-summary">
            <h3>
              Project summary
              <button className="btn" data-variant="quiet" onClick={() => props.onTab('details')}>Edit</button>
            </h3>
            <p className="pj-blurb">
              {doc.artwork.description.trim() || 'No description yet.'}
            </p>
            <dl className="pj-facts">
              <Fact label="Size" value={dimensions(doc)} />
              <Fact label="Medium" value={doc.artwork.materials} />
              <Fact
                label="Timeline"
                value={
                  doc.schedule.targetCompletionDate
                    ? `${shortDate(doc.createdDate)} – ${shortDate(doc.schedule.targetCompletionDate)}`
                    : null
                }
              />
              <Fact label="Location" value={doc.client.projectAddress} />
              <Fact label="Price" value={money(totals.total)} />
              <Fact
                label={totals.credit !== null ? 'Credit' : 'Balance'}
                value={money(totals.credit ?? totals.balance)}
              />
            </dl>
          </section>

          <section className="pj-block">
            <h3>
              Production milestones
              <button className="btn" data-variant="quiet" onClick={() => props.onTab('milestones')}>
                Edit
              </button>
            </h3>
            {progress.total === 0 ? (
              <p className="hint">
                None set. Milestones are stages you choose — the app does not assume them.
              </p>
            ) : (
              <MilestoneList
                milestones={milestonesOf(doc)}
                onToggle={(id) => props.onDocChange(toggle(doc, id))}
              />
            )}
          </section>

          <section className="pj-block">
            <h3>
              Project files
              <button className="btn" data-variant="quiet" onClick={() => props.onTab('files')}>
                View all
              </button>
            </h3>
            {images.length === 0 ? (
              <p className="hint">No files yet.</p>
            ) : (
              <div className="pj-filestrip">
                {images.slice(0, 5).map((id, index) => (
                  <button
                    key={id}
                    className="pj-file"
                    data-selected={id === shownImage}
                    onClick={() => setSelectedImage(id)}
                  >
                    {imageUrls[id] ? <img src={imageUrls[id]} alt="" /> : <span className="missing" />}
                    <span className="cap">{index === 0 ? 'Current version' : `File ${index + 1}`}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'details' && <div className="pj-pane">{props.editorSlot}</div>}

      {tab === 'document' && <div className="pj-pane">{props.documentSlot}</div>}

      {tab === 'files' && (
        <div className="pj-pane">
          <ImageDrop
            onFiles={props.onAddImages}
            error={props.imageError}
            label="Drop images here"
            hint="or click to choose · PNG, JPEG, WebP · up to 8 MB each"
          >
            {images.map((id, index) => (
              <figure className="ref-image" key={id}>
                {imageUrls[id] ? (
                  <img src={imageUrls[id]} alt={`Reference ${index + 1}`} />
                ) : (
                  <span className="missing">Not on this device</span>
                )}
                {index === 0 && <figcaption>Thumbnail</figcaption>}
                <button
                  className="remove"
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() => props.onRemoveImage(id)}
                >
                  ✕
                </button>
              </figure>
            ))}
          </ImageDrop>
          <p className="hint">
            The first image is the project's thumbnail on the desktop. Images stay on this
            device — they are not uploaded anywhere.
          </p>
        </div>
      )}

      {tab === 'milestones' && (
        <div className="pj-pane">
          <MilestoneEditor doc={doc} onDocChange={props.onDocChange} />
        </div>
      )}

      {tab === 'invoices' && (
        <div className="pj-pane">
          <div className="pj-pane-head">
            <p className="hint" style={{ margin: 0 }}>
              An invoice copies this commission as it stands today. Editing the commission
              afterwards does not change an invoice the client already has.
            </p>
            <button className="btn" data-variant="primary" onClick={props.onNewInvoice}>
              New invoice
            </button>
          </div>
          {invoices.length === 0 ? (
            <p className="hint">None yet.</p>
          ) : (
            <ul className="doc-list">
              {invoices.map((invoice) => {
                const t = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
                return (
                  <li key={invoice.id} className="doc-row" onDoubleClick={() => props.onOpenInvoice(invoice.id)}>
                    <span className="grow">
                      <span className="num">{invoice.invoiceNumber}</span>
                      <br />
                      <span className="name">
                        {invoice.dueDate ? `Due ${shortDate(invoice.dueDate)}` : 'No due date set'}
                      </span>
                    </span>
                    <span className="badge" data-state={invoice.state}>{invoice.state}</span>
                    <span>
                      {t.credit !== null
                        ? `${formatMoney(t.credit, invoice.quote.currency)} credit`
                        : `${formatMoney(t.balance, invoice.quote.currency)} due`}
                    </span>
                    <button className="btn" onClick={() => props.onOpenInvoice(invoice.id)}>Open</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'updates' && <div className="pj-pane">{props.updatesSlot}</div>}

      {tab === 'notes' && (
        <div className="pj-pane">
          <div className="field">
            <label htmlFor="pj-notes">Private notes</label>
            <textarea
              id="pj-notes"
              style={{ minHeight: 220 }}
              value={doc.privateNotes ?? ''}
              onChange={(e) => props.onChange({ privateNotes: e.target.value || null })}
            />
            <span className="hint">
              These never reach the client. They are excluded from every preview, export and
              printed document by the model itself, not by remembering to hide them.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function toggle(doc: CommissionDocument, id: string): CommissionDocument {
  const milestones = milestonesOf(doc).map((m) => (m.id === id ? { ...m, done: !m.done } : m));
  return { ...doc, schedule: { ...doc.schedule, milestones } };
}

function MilestoneList({
  milestones,
  onToggle,
}: {
  milestones: Milestone[];
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="milestones">
      {milestones.map((milestone) => (
        <li key={milestone.id}>
          <button
            className="ms-check"
            data-done={milestone.done}
            onClick={() => onToggle(milestone.id)}
            aria-pressed={milestone.done}
            aria-label={`Mark ${milestone.label} ${milestone.done ? 'not done' : 'done'}`}
          >
            <span aria-hidden="true">{milestone.done ? '✓' : ''}</span>
          </button>
          <span className="ms-label" data-done={milestone.done}>{milestone.label}</span>
          <span className="ms-date">{shortDate(milestone.date)}</span>
        </li>
      ))}
    </ul>
  );
}

function MilestoneEditor({
  doc,
  onDocChange,
}: {
  doc: CommissionDocument;
  onDocChange: (doc: CommissionDocument) => void;
}) {
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const milestones = milestonesOf(doc);

  const setMilestones = (next: Milestone[]) =>
    onDocChange({ ...doc, schedule: { ...doc.schedule, milestones: next } });

  return (
    <>
      {milestones.length === 0 && (
        <div className="notice">
          No milestones yet. Add your own, or start from the stages most commissions go
          through — you can rename or delete any of them.
          <div className="chip-row" style={{ marginTop: 10 }}>
            <button
              className="btn"
              onClick={() => setMilestones(SUGGESTED_STAGES.map((stage) => createMilestone(stage)))}
            >
              Use the usual stages
            </button>
          </div>
        </div>
      )}

      <ul className="milestones editable">
        {milestones.map((milestone) => (
          <li key={milestone.id}>
            <button
              className="ms-check"
              data-done={milestone.done}
              onClick={() =>
                setMilestones(
                  milestones.map((m) => (m.id === milestone.id ? { ...m, done: !m.done } : m)),
                )
              }
              aria-pressed={milestone.done}
              aria-label={`Mark ${milestone.label} ${milestone.done ? 'not done' : 'done'}`}
            >
              <span aria-hidden="true">{milestone.done ? '✓' : ''}</span>
            </button>
            <input
              type="text"
              aria-label="Milestone"
              value={milestone.label}
              onChange={(e) =>
                setMilestones(
                  milestones.map((m) => (m.id === milestone.id ? { ...m, label: e.target.value } : m)),
                )
              }
            />
            <input
              type="date"
              aria-label={`Date for ${milestone.label}`}
              value={milestone.date ?? ''}
              onChange={(e) =>
                setMilestones(
                  milestones.map((m) =>
                    m.id === milestone.id ? { ...m, date: e.target.value || null } : m,
                  ),
                )
              }
            />
            <button
              className="btn"
              data-variant="quiet"
              aria-label={`Remove ${milestone.label}`}
              onClick={() => setMilestones(milestones.filter((m) => m.id !== milestone.id))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="ms-add">
        <input
          type="text"
          placeholder="Add a stage"
          aria-label="New milestone"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          type="date"
          aria-label="New milestone date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          className="btn"
          disabled={label.trim() === ''}
          onClick={() => {
            setMilestones([...milestones, createMilestone(label.trim(), date || null)]);
            setLabel('');
            setDate('');
          }}
        >
          Add
        </button>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  const shown = value?.trim();
  return (
    <div>
      <dt>{label}</dt>
      <dd className={shown ? '' : 'unset'}>{shown || 'Not set'}</dd>
    </div>
  );
}

function dimensions(doc: CommissionDocument): string | null {
  const { width, height, unit } = doc.artwork;
  if (width === null || height === null) return null;
  return `${width} × ${height} ${unit}`;
}

function statusLabel(doc: CommissionDocument, current: Milestone | null): string {
  if (doc.state === 'archived') return 'Archived';
  if (current) return current.label;
  if (doc.state === 'issued') return 'Issued';
  return 'Draft';
}
