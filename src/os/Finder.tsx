import { useState } from 'react';
import { calculateTotals, formatMoney } from '../commission/calc';
import type { CommissionDocument } from '../commission/types';
import type { Invoice } from '../invoice/types';
import { projectItemCount, type Project } from '../project/project';

export type FinderPlace =
  | { kind: 'all' }
  | { kind: 'documents' }
  | { kind: 'invoices' }
  | { kind: 'loose' }
  | { kind: 'folder'; id: string };

export interface FinderRow {
  id: string;
  kind: 'project' | 'document' | 'invoice';
  name: string;
  detail: string;
  amount: string | null;
  updatedAt: string;
  /** The folder this is filed in, if any. */
  folderName: string | null;
  thumbId: string | null;
}

interface Props {
  projects: Project[];
  documents: CommissionDocument[];
  invoices: Invoice[];
  /** Which folder each document and invoice is filed in, by item id. */
  folderOf: Record<string, string>;
  imageUrls: Record<string, string>;
  onOpen: (kind: FinderRow['kind'], id: string) => void;
  onFileInto: (folderId: string, itemId: string) => void;
  onTakeOut: (itemId: string) => void;
  onNewFolder: () => void;
  onRenameFolder: (folderId: string, name: string) => void;
}

const NO_DEPOSIT = { kind: 'percent' as const, value: null };

/**
 * Finder: everything in the studio in one list, and a way to move it around.
 *
 * A second view over the same records, not a second copy of them. Filing
 * something here and filing it by dragging on the desktop go through exactly
 * the same functions, so the two can never disagree.
 */
export function Finder(props: Props) {
  const [place, setPlace] = useState<FinderPlace>({ kind: 'all' });
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const rows = buildRows(props).filter((row) => inPlace(row, place, props.folderOf));
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? rows.filter((row) =>
        `${row.name} ${row.detail} ${row.folderName ?? ''}`.toLowerCase().includes(needle),
      )
    : rows;

  const selectedRow = shown.find((row) => row.id === selected) ?? null;

  return (
    <div className="finder">
      <nav className="fnd-side" aria-label="Places">
        <h4>Studio</h4>
        <Place label="All items" count={buildRows(props).length} active={place.kind === 'all'} onClick={() => setPlace({ kind: 'all' })} />
        <Place label="Commissions" count={props.documents.length} active={place.kind === 'documents'} onClick={() => setPlace({ kind: 'documents' })} />
        <Place label="Invoices" count={props.invoices.length} active={place.kind === 'invoices'} onClick={() => setPlace({ kind: 'invoices' })} />
        <Place label="Not in a folder" count={looseCount(props)} active={place.kind === 'loose'} onClick={() => setPlace({ kind: 'loose' })} />

        <h4>
          Folders
          <button className="btn" data-variant="quiet" onClick={props.onNewFolder}>New</button>
        </h4>
        {props.projects.length === 0 && <p className="hint">No folders yet.</p>}
        {props.projects.map((project) => (
          <Place
            key={project.id}
            label={project.name}
            count={projectItemCount(project)}
            active={place.kind === 'folder' && place.id === project.id}
            onClick={() => setPlace({ kind: 'folder', id: project.id })}
          />
        ))}
      </nav>

      <div className="fnd-main">
        <div className="fnd-bar">
          <input
            type="text"
            className="fnd-search"
            placeholder="Search this view"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="chip-row">
            <button className="btn" data-variant={view === 'list' ? 'primary' : 'quiet'} onClick={() => setView('list')}>List</button>
            <button className="btn" data-variant={view === 'grid' ? 'primary' : 'quiet'} onClick={() => setView('grid')}>Icons</button>
          </div>
        </div>

        {place.kind === 'folder' && (
          <div className="fnd-folder-head">
            <input
              className="fnd-rename"
              aria-label="Folder name"
              value={props.projects.find((p) => p.id === place.id)?.name ?? ''}
              onChange={(e) => props.onRenameFolder(place.id, e.target.value)}
            />
            <span className="hint">Renaming here renames it on the desktop too.</span>
          </div>
        )}

        {shown.length === 0 ? (
          <div className="empty">
            <h3>Nothing here</h3>
            <p>{needle ? 'No item matches that search.' : 'This place is empty.'}</p>
          </div>
        ) : view === 'list' ? (
          <table className="fnd-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Folder</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr
                  key={row.id}
                  data-selected={selected === row.id}
                  onClick={() => setSelected(row.id)}
                  onDoubleClick={() => props.onOpen(row.kind, row.id)}
                >
                  <td>
                    <span className="fnd-name">{row.name}</span>
                    <span className="fnd-detail">{row.detail}</span>
                  </td>
                  <td className="fnd-kind">{kindLabel(row.kind)}</td>
                  <td className="fnd-kind">{row.folderName ?? '—'}</td>
                  <td className="num">{row.amount ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="fnd-grid">
            {shown.map((row) => (
              <button
                key={row.id}
                className="fnd-cell"
                data-selected={selected === row.id}
                onClick={() => setSelected(row.id)}
                onDoubleClick={() => props.onOpen(row.kind, row.id)}
              >
                <span className="fnd-thumb">
                  {row.thumbId && props.imageUrls[row.thumbId] ? (
                    <img src={props.imageUrls[row.thumbId]} alt="" />
                  ) : row.kind === 'project' ? (
                    <span className="folder-face" />
                  ) : (
                    <span className="sheet-face" />
                  )}
                </span>
                <span className="fnd-name">{row.name}</span>
                <span className="fnd-detail">{row.detail}</span>
              </button>
            ))}
          </div>
        )}

        {/* Moving things between folders, for anyone who would rather not
            drag icons around — and for a phone, where dragging is awkward. */}
        {selectedRow && (
          <div className="fnd-actions">
            <span className="fnd-selected">{selectedRow.name}</span>
            <button className="btn" data-variant="primary" onClick={() => props.onOpen(selectedRow.kind, selectedRow.id)}>
              Open
            </button>
            {/* A folder cannot be filed into another folder, so it gets Open
                and nothing else. */}
            {selectedRow.kind !== 'project' && (
            <label className="fnd-move">
              Move to
              <select
                value={props.folderOf[selectedRow.id] ?? ''}
                onChange={(e) => {
                  if (e.target.value) props.onFileInto(e.target.value, selectedRow.id);
                  else props.onTakeOut(selectedRow.id);
                }}
              >
                <option value="">Desktop (no folder)</option>
                {props.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Place({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className="fnd-place" aria-current={active} onClick={onClick}>
      <span className="fnd-place-name">{label}</span>
      <span className="fnd-place-count">{count}</span>
    </button>
  );
}

function kindLabel(kind: FinderRow['kind']): string {
  if (kind === 'project') return 'Folder';
  if (kind === 'invoice') return 'Invoice';
  return 'Commission';
}

function looseCount(props: Props): number {
  return buildRows(props).filter((row) => row.kind !== 'project' && !row.folderName).length;
}

function inPlace(row: FinderRow, place: FinderPlace, folderOf: Record<string, string>): boolean {
  switch (place.kind) {
    case 'all':
      return true;
    case 'documents':
      return row.kind === 'document';
    case 'invoices':
      return row.kind === 'invoice';
    case 'loose':
      return row.kind !== 'project' && !row.folderName;
    case 'folder':
      return folderOf[row.id] === place.id;
    default:
      return true;
  }
}

function buildRows(props: Props): FinderRow[] {
  const folderName = (id: string) =>
    props.projects.find((p) => p.id === props.folderOf[id])?.name ?? null;

  const projects: FinderRow[] = props.projects.map((project) => ({
    id: project.id,
    kind: 'project',
    name: project.name,
    detail: projectItemCount(project) === 1 ? '1 item' : `${projectItemCount(project)} items`,
    amount: null,
    updatedAt: project.updatedAt,
    folderName: null,
    thumbId: project.coverImageId,
  }));

  const documents: FinderRow[] = props.documents.map((doc) => {
    const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
    return {
      id: doc.id,
      kind: 'document',
      name: doc.title.trim() || doc.documentNumber,
      detail: doc.client.name.trim() || 'No client set',
      amount: formatMoney(totals.total, doc.quote.currency),
      updatedAt: doc.updatedAt,
      folderName: folderName(doc.id),
      thumbId: doc.artwork.referenceImageIds[0] ?? null,
    };
  });

  const invoices: FinderRow[] = props.invoices.map((invoice) => {
    const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
    return {
      id: invoice.id,
      kind: 'invoice',
      name: invoice.invoiceNumber,
      detail: invoice.client.name.trim() || 'No client set',
      // What is owed, not what it was worth: that is the number being looked for.
      amount:
        totals.credit !== null
          ? `${formatMoney(totals.credit, invoice.quote.currency)} credit`
          : `${formatMoney(totals.balance, invoice.quote.currency)} due`,
      updatedAt: invoice.updatedAt,
      folderName: folderName(invoice.id),
      thumbId: null,
    };
  });

  return [...projects, ...documents, ...invoices].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
