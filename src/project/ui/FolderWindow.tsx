import { calculateTotals, formatMoney } from '../../commission/calc';
import type { CommissionDocument } from '../../commission/types';
import type { Photo } from '../../photo/photo';
import { describePhoto } from '../../photo/photo';
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
  photos: Photo[];
  imageUrls: Record<string, string>;
  onOpenPhoto: (id: string) => void;
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
  const { project, documents, invoices, photos } = props;
  const empty = documents.length === 0 && invoices.length === 0 && photos.length === 0;

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
          <p>
            Documents, invoices and pictures you file here show up in this window. Drag an icon
            onto the folder on the desktop, or use Add images above.
          </p>
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

      {photos.length > 0 && (
        <>
          <h3 className="folder-heading">Pictures</h3>
          <div className="folder-plates">
            {photos.map((photo) => (
              <figure
                key={photo.id}
                className="folder-plate"
                onDoubleClick={() => props.onOpenPhoto(photo.id)}
                title="Double-click to open"
              >
                {props.imageUrls[photo.imageId] ? (
                  <img src={props.imageUrls[photo.imageId]} alt={photo.title} />
                ) : (
                  <span className="sheet-face" />
                )}
                <figcaption>
                  <span className="name">{photo.title}</span>
                  <span className="fnd-detail">{describePhoto(photo)}</span>
                  <span className="chip-row">
                    <button className="btn" onClick={() => props.onOpenPhoto(photo.id)}>Open</button>
                    <button
                      className="btn"
                      data-variant="quiet"
                      title="Move this back to the desktop. It is not deleted."
                      onClick={() => props.onRemoveItem(photo.id)}
                    >
                      Take out
                    </button>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
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
