import { calculateTotals, formatMoney } from '../calc';
import type { StoredDocument } from '../../persistence/repository';

interface Props {
  rows: StoredDocument[];
  search: string;
  onSearch: (value: string) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onNew: () => void;
  showArchived: boolean;
  onToggleArchived: () => void;
}

export function matchesSearch(row: StoredDocument, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === '') return true;
  const doc = row.document;
  return [doc.client.name, doc.title, doc.documentNumber]
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(needle));
}

export function DocumentList(props: Props) {
  const visible = props.rows
    .filter((row) => props.showArchived || row.document.state !== 'archived')
    .filter((row) => matchesSearch(row, props.search));

  if (props.rows.length === 0) {
    return (
      <div className="empty">
        <h3>No commission documents yet</h3>
        <p>Create one to quote a piece, record a deposit and print a document for the client.</p>
        <button className="btn" data-variant="primary" onClick={props.onNew}>
          New document
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* The list filters itself. The search box in the system bar finds a
          commission from anywhere; this narrows the list that is open. */}
      <div className="field">
        <label htmlFor="list-search">Search documents</label>
        <input
          id="list-search"
          type="text"
          placeholder="Client, title or number"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn" data-variant="primary" onClick={props.onNew}>New document</button>
        <button className="btn" onClick={props.onToggleArchived} aria-pressed={props.showArchived}>
          {props.showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <h3>Nothing matches “{props.search}”</h3>
          <p>Search looks at the client name, the title and the document number.</p>
        </div>
      ) : (
        <ul className="doc-list">
          {visible.map((row) => {
            const doc = row.document;
            const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
            return (
              <li key={row.id} className="doc-row">
                <div className="grow">
                  <div className="num">{doc.documentNumber}</div>
                  <div className="name">{doc.title || 'Untitled document'}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {doc.client.name || 'No client yet'}
                    {doc.isDemo && <span className="demo-tag"> · demo data</span>}
                  </div>
                </div>
                <span className="badge" data-state={doc.state}>{doc.state}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(totals.total, doc.quote.currency)}
                </span>
                <button className="btn" onClick={() => props.onOpen(row.id)}>Open</button>
                <button className="btn" data-variant="quiet" onClick={() => props.onDuplicate(row.id)}>
                  Duplicate
                </button>
                {doc.state !== 'archived' && (
                  <button className="btn" data-variant="quiet" onClick={() => props.onArchive(row.id)}>
                    Archive
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
