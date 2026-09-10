import { calculateTotals, formatMoney } from '../../commission/calc';
import type { CommissionDocument } from '../../commission/types';
import type { Invoice } from '../../invoice/types';
import type { Project } from '../project';

interface Props {
  project: Project;
  documents: CommissionDocument[];
  invoices: Invoice[];
  onOpenDocument: (id: string) => void;
  onOpenInvoice: (id: string) => void;
  onRename: (name: string) => void;
  onNewInvoice: () => void;
  onRemoveItem: (id: string) => void;
}

const NO_DEPOSIT = { kind: 'percent' as const, value: null };

/**
 * The inside of a project folder: the commission documents and the invoices
 * filed into it. Rows open on double-click like the desktop icons do.
 *
 * Taking an item out of a folder does not delete it — it goes back to the
 * desktop, and the row says so.
 */
export function FolderWindow(props: Props) {
  const { project, documents, invoices } = props;
  const empty = documents.length === 0 && invoices.length === 0;

  return (
    <div className="folder-window">
      <div className="field" style={{ maxWidth: 380 }}>
        <label htmlFor="folder-name">Folder name</label>
        <input
          id="folder-name"
          type="text"
          value={project.name}
          onChange={(e) => props.onRename(e.target.value)}
        />
      </div>

      {empty && (
        <div className="empty">
          <h3>This folder is empty</h3>
          <p>Documents and invoices you file here will show up in this window.</p>
        </div>
      )}

      {documents.length > 0 && (
        <>
          <h3 className="folder-heading">Documents</h3>
          <ul className="doc-list">
            {documents.map((doc) => {
              const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
              return (
                <li
                  key={doc.id}
                  className="doc-row"
                  onDoubleClick={() => props.onOpenDocument(doc.id)}
                  title="Double-click to open"
                >
                  <span className="grow">
                    <span className="num">{doc.documentNumber}</span>
                    <br />
                    <span className="name">{doc.title.trim() || 'Untitled commission'}</span>
                  </span>
                  <span className="badge" data-state={doc.state}>{doc.state}</span>
                  <span>{formatMoney(totals.total, doc.quote.currency)}</span>
                  <button className="btn" onClick={() => props.onOpenDocument(doc.id)}>Open</button>
                  <button
                    className="btn"
                    data-variant="quiet"
                    title="Move this back to the desktop. It is not deleted."
                    onClick={() => props.onRemoveItem(doc.id)}
                  >
                    Take out
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3 className="folder-heading">
        Invoices
        <button className="btn" data-variant="primary" onClick={props.onNewInvoice}>
          New invoice
        </button>
      </h3>

      {invoices.length === 0 ? (
        <p className="hint">No invoices for this project yet.</p>
      ) : (
        <ul className="doc-list">
          {invoices.map((invoice) => {
            const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
            return (
              <li
                key={invoice.id}
                className="doc-row"
                onDoubleClick={() => props.onOpenInvoice(invoice.id)}
                title="Double-click to open"
              >
                <span className="grow">
                  <span className="num">{invoice.invoiceNumber}</span>
                  <br />
                  <span className="name">
                    {invoice.dueDate ? `Due ${invoice.dueDate}` : 'No due date set'}
                  </span>
                </span>
                <span className="badge" data-state={invoice.state}>{invoice.state}</span>
                <span>
                  {totals.credit !== null
                    ? `${formatMoney(totals.credit, invoice.quote.currency)} credit`
                    : `${formatMoney(totals.balance, invoice.quote.currency)} due`}
                </span>
                <button className="btn" onClick={() => props.onOpenInvoice(invoice.id)}>Open</button>
                <button
                  className="btn"
                  data-variant="quiet"
                  title="Move this back to the desktop. It is not deleted."
                  onClick={() => props.onRemoveItem(invoice.id)}
                >
                  Take out
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
