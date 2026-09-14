import { useMemo, useState } from 'react';
import { formatMoney, parseMoney } from '../../commission/calc';
import {
  describePrice,
  describeSize,
  describeStatus,
  statusOf,
  type Photo,
  type PhotoStatus,
} from '../../photo/photo';
import {
  LOCATIONS,
  askingInMinor,
  catalogueCsv,
  clientLine,
  clientPieces,
  describeLocation,
  describeSummary,
  emptySale,
  isSold,
  netOf,
  saleYears,
  salesCsv,
  salesTotal,
  shownPieces,
  soldPieces,
  summarise,
  type PieceFilter,
  type PieceLocation,
  type Sale,
  type SortKey,
} from '../catalogue';

interface Props {
  photos: Photo[];
  imageUrls: Record<string, string>;
  onChange: (photo: Photo, changes: Partial<Photo>) => void;
  /**
   * Opens the picture on its own, with the arrows and fullscreen. The second
   * argument is the order the arrows walk: the wall as it is sorted and
   * filtered right now, not the studio's own order.
   */
  onPreview: (photoId: string, within: string[]) => void;
  /** Opens the darkroom on that picture. */
  onEdit: (photoId: string) => void;
  onMessage: (text: string) => void;
}

type View = 'grid' | 'table' | 'sales';

const FILTERS: { id: PieceFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'available', label: 'Available' },
  { id: 'sold', label: 'Sold' },
  { id: 'nfs', label: 'Not for sale' },
  { id: 'unsaid', label: 'Not said' },
  { id: 'unpriced', label: 'No price yet' },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'title', label: 'Title' },
  { id: 'price-high', label: 'Price, high' },
  { id: 'price-low', label: 'Price, low' },
  { id: 'size', label: 'Size' },
];

/**
 * The catalogue: everything the studio has, in one place.
 *
 * Three ways to look at the same records — a wall of pictures, a table to
 * work down, and what sold — and a client view that hands the whole library
 * to somebody standing next to you without showing them what anything sold
 * for or what is still unpriced in your own notes.
 *
 * Nothing here computes a status or a price. It shows what the artist set,
 * and where nothing was set it says so.
 */
export function ArtworkWindow(props: Props) {
  const { photos, imageUrls } = props;
  const [view, setView] = useState<View>('grid');
  const [filter, setFilter] = useState<PieceFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [query, setQuery] = useState('');
  const [client, setClient] = useState(false);
  const [showSold, setShowSold] = useState(true);
  const [selling, setSelling] = useState<string | null>(null);
  /** The client's picks. Theirs, kept only while the tool is open. */
  const [picked, setPicked] = useState<string[]>([]);
  const [sendTo, setSendTo] = useState('');
  const [year, setYear] = useState<number | 'all'>('all');

  const summary = useMemo(() => summarise(photos), [photos]);
  const shown = useMemo(
    () =>
      client
        ? clientPieces(shownPieces(photos, { filter: 'all', query, sort }), { showSold })
        : shownPieces(photos, { filter, query, sort }),
    [client, filter, photos, query, showSold, sort],
  );
  const years = useMemo(() => saleYears(photos), [photos]);
  const sold = useMemo(
    () => soldPieces(photos, year === 'all' ? undefined : year),
    [photos, year],
  );
  const total = useMemo(
    () => salesTotal(photos, year === 'all' ? undefined : year),
    [photos, year],
  );
  const currency = photos[0]?.currency ?? 'USD';
  /** What the arrows in the preview walk: exactly what is on screen. */
  const shownIds = shown.map((photo) => photo.id);

  if (photos.length === 0) {
    return (
      <div className="empty">
        <h3>Nothing in the catalogue yet</h3>
        <p>
          Every picture you add to the desktop appears here. Add images, and this becomes the
          list of what you have, where it is and what it sold for.
        </p>
      </div>
    );
  }

  const pickedPieces = picked
    .map((id) => photos.find((photo) => photo.id === id))
    .filter((photo): photo is Photo => Boolean(photo));

  const mailtoPicks = () => {
    const body = [
      'The pieces I liked:',
      '',
      ...pickedPieces.map((photo) => `• ${photo.title} — ${clientLine(photo)}`),
      '',
      '(The pictures themselves are not attached — ask the studio and they will send them.)',
    ].join('\n');
    return `mailto:${encodeURIComponent(sendTo)}?subject=${encodeURIComponent(
      'Pieces I liked',
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="art" data-client={client}>
      <div className="art-bar">
        <div className="chip-row">
          {(['grid', 'table', 'sales'] as View[]).map((one) => (
            <button
              key={one}
              className="btn"
              data-variant={view === one ? 'primary' : 'quiet'}
              aria-pressed={view === one}
              // The table and the ledger are the artist's own work.
              disabled={client && one !== 'grid'}
              onClick={() => setView(one)}
            >
              {one === 'grid' ? 'Wall' : one === 'table' ? 'List' : 'Sold'}
            </button>
          ))}
        </div>

        <input
          className="fnd-search"
          placeholder="Search the catalogue"
          aria-label="Search the catalogue"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <button
          className="btn"
          data-variant={client ? 'primary' : 'quiet'}
          aria-pressed={client}
          onClick={() => {
            setClient(!client);
            setView('grid');
            setSelling(null);
          }}
        >
          {client ? 'Back to the studio view' : 'Client view'}
        </button>
      </div>

      {client ? (
        <div className="art-clientbar">
          <span className="hint">
            Hand it over. Prices show as you set them, nothing shows what anything sold for, and
            your notes are not here.
          </span>
          <label className="check">
            <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} />
            <span>Show sold work</span>
          </label>
        </div>
      ) : (
        <div className="art-filters">
          <div className="chip-row">
            {FILTERS.map((one) => (
              <button
                key={one.id}
                className="btn"
                data-variant={filter === one.id ? 'primary' : 'quiet'}
                aria-pressed={filter === one.id}
                onClick={() => setFilter(one.id)}
              >
                {one.label}
              </button>
            ))}
          </div>
          <div className="art-sort">
            <label htmlFor="art-sort">Sort</label>
            <select id="art-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.label}
                </option>
              ))}
            </select>
          </div>
          <span className="hint art-count">{describeSummary(summary)}</span>
        </div>
      )}

      {view === 'grid' && (
        <div className="art-wall">
          {shown.map((photo) => {
            const url = imageUrls[photo.imageId];
            const isPicked = picked.includes(photo.id);
            return (
              <figure
                key={photo.id}
                className="art-piece"
                data-picked={isPicked}
                data-sold={isSold(photo)}
              >
                <button
                  className="art-plate"
                  title={`${photo.title} — click to see it on its own`}
                  onClick={() => {
                    if (client) {
                      setPicked(
                        isPicked ? picked.filter((id) => id !== photo.id) : [...picked, photo.id],
                      );
                      return;
                    }
                    props.onPreview(photo.id, shownIds);
                  }}
                  onDoubleClick={() => client && props.onPreview(photo.id, shownIds)}
                >
                  {url ? <img src={url} alt={photo.title} loading="lazy" /> : <span className="sheet-face" />}
                  {isSold(photo) && <span className="art-sold">Sold</span>}
                  {isPicked && <span className="art-tick" aria-hidden="true">✓</span>}
                </button>
                <figcaption>
                  <strong>{photo.title}</strong>
                  <span>{client ? clientLine(photo) : studioLine(photo)}</span>
                </figcaption>
                {!client && (
                  <div className="art-piece-actions">
                    <button
                      className="btn"
                      data-variant="quiet"
                      onClick={() => props.onPreview(photo.id, shownIds)}
                    >
                      Look
                    </button>
                    <button className="btn" data-variant="quiet" onClick={() => props.onEdit(photo.id)}>
                      Edit
                    </button>
                    <button
                      className="btn"
                      data-variant="quiet"
                      onClick={() => setSelling(selling === photo.id ? null : photo.id)}
                    >
                      {photo.sale ? 'Sale' : 'Sold?'}
                    </button>
                  </div>
                )}
                {selling === photo.id && !client && (
                  <SaleForm
                    photo={photo}
                    onCancel={() => setSelling(null)}
                    onSave={(sale) => {
                      // Recording a sale is also saying it is sold: two places
                      // that could disagree would, eventually.
                      props.onChange(photo, { sale, status: 'sold' });
                      setSelling(null);
                      props.onMessage(`Sale recorded for “${photo.title}”.`);
                    }}
                    onClear={() => {
                      // The status is left alone: it was set by hand and this
                      // has no business guessing what it should go back to.
                      props.onChange(photo, { sale: null });
                      setSelling(null);
                      props.onMessage('Sale removed. The status is still what you set it to.');
                    }}
                  />
                )}
              </figure>
            );
          })}
          {shown.length === 0 && (
            <p className="hint">Nothing matches. Try another filter, or clear the search.</p>
          )}
        </div>
      )}

      {view === 'table' && !client && (
        <div className="art-table-wrap">
          <table className="art-table">
            <thead>
              <tr>
                <th scope="col">Piece</th>
                <th scope="col">Size</th>
                <th scope="col">Price</th>
                <th scope="col">Status</th>
                <th scope="col">Where it is</th>
                <th scope="col">Sold</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((photo) => (
                <tr key={photo.id}>
                  <th scope="row">
                    <button
                      className="art-row-name"
                      onClick={() => props.onPreview(photo.id, shownIds)}
                    >
                      {imageUrls[photo.imageId] && (
                        <img src={imageUrls[photo.imageId]} alt="" loading="lazy" />
                      )}
                      {photo.title}
                    </button>
                  </th>
                  <td>{describeSize(photo) ?? <span className="faint">Not measured</span>}</td>
                  <td>
                    <input
                      className="art-cell"
                      type="number"
                      min="0"
                      step="1"
                      value={photo.price ?? ''}
                      placeholder="On request"
                      aria-label={`Price for ${photo.title}`}
                      onChange={(e) =>
                        props.onChange(photo, {
                          price: e.target.value.trim() === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="art-cell"
                      value={statusOf(photo) ?? ''}
                      aria-label={`Status of ${photo.title}`}
                      onChange={(e) =>
                        props.onChange(photo, { status: (e.target.value || null) as PhotoStatus })
                      }
                    >
                      <option value="">Not said</option>
                      <option value="available">Available</option>
                      <option value="sold">Sold</option>
                      <option value="nfs">Not for sale</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="art-cell"
                      value={photo.location ?? ''}
                      aria-label={`Where ${photo.title} is`}
                      onChange={(e) =>
                        props.onChange(photo, {
                          location: (e.target.value || null) as PieceLocation | null,
                        })
                      }
                    >
                      <option value="">Not said</option>
                      {LOCATIONS.map((one) => (
                        <option key={one.id} value={one.id}>
                          {one.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {photo.sale ? (
                      <span>
                        {photo.sale.date}
                        {photo.sale.amount !== null ? ` · ${formatMoney(photo.sale.amount, photo.currency)}` : ''}
                      </span>
                    ) : (
                      <button
                        className="btn"
                        data-variant="quiet"
                        onClick={() => {
                          setView('grid');
                          setSelling(photo.id);
                        }}
                      >
                        Record a sale
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="chip-row">
            <button
              className="btn"
              data-variant="quiet"
              onClick={() => {
                downloadText(catalogueCsv(shown), 'catalogue.csv');
                props.onMessage('Catalogue saved as a CSV — it opens in any spreadsheet.');
              }}
            >
              Export the list
            </button>
            <span className="hint">Everything shown, with the empty cells left empty.</span>
          </div>
        </div>
      )}

      {view === 'sales' && !client && (
        <div className="art-sales">
          <div className="chip-row">
            <button
              className="btn"
              data-variant={year === 'all' ? 'primary' : 'quiet'}
              onClick={() => setYear('all')}
            >
              Every year
            </button>
            {years.map((one) => (
              <button
                key={one}
                className="btn"
                data-variant={year === one ? 'primary' : 'quiet'}
                onClick={() => setYear(one)}
              >
                {one}
              </button>
            ))}
          </div>

          <div className="art-figures">
            <div>
              <span className="k">Sold for</span>
              <strong>{formatMoney(total.gross, currency)}</strong>
            </div>
            <div>
              <span className="k">Kept</span>
              <strong>{formatMoney(total.net, currency)}</strong>
            </div>
            <div>
              <span className="k">Sales counted</span>
              <strong>{total.counted}</strong>
            </div>
          </div>
          <p className="hint">
            {total.missing === 0
              ? 'Every sale here has a figure on it.'
              : `${total.missing} ${
                  total.missing === 1 ? 'sale has' : 'sales have'
                } no figure recorded, so ${total.missing === 1 ? 'it is' : 'they are'} not in these totals.`}{' '}
            What a gallery took is subtracted only where it was written down.
          </p>

          {sold.length === 0 ? (
            <div className="empty">
              <h3>Nothing recorded as sold</h3>
              <p>Record a sale on a piece and it appears here, with the date and the figure.</p>
            </div>
          ) : (
            <ul className="art-ledger">
              {sold.map((photo) => (
                <li key={photo.id}>
                  <button
                    className="art-row-name"
                    onClick={() => props.onPreview(photo.id, sold.map((one) => one.id))}
                  >
                    {imageUrls[photo.imageId] && <img src={imageUrls[photo.imageId]} alt="" loading="lazy" />}
                    {photo.title}
                  </button>
                  <span className="art-ledger-when">{photo.sale.date}</span>
                  <span className="art-ledger-where">
                    {photo.sale.where ?? <span className="faint">Where not said</span>}
                    {photo.sale.buyer ? ` · ${photo.sale.buyer}` : ''}
                  </span>
                  <span className="art-ledger-money">
                    {photo.sale.amount === null ? (
                      <span className="faint">No figure recorded</span>
                    ) : (
                      <>
                        {formatMoney(photo.sale.amount, photo.currency)}
                        {photo.sale.fee !== null && (
                          <span className="faint">
                            {' '}
                            · kept {formatMoney(netOf(photo.sale) ?? 0, photo.currency)}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <button
                    className="btn"
                    data-variant="quiet"
                    onClick={() => {
                      setView('grid');
                      setSelling(photo.id);
                    }}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="chip-row">
            <button
              className="btn"
              data-variant="quiet"
              disabled={sold.length === 0}
              onClick={() => {
                downloadText(salesCsv(photos, year === 'all' ? undefined : year), 'sales.csv');
                props.onMessage('Sales saved as a CSV. It is the sheet an accountant asks for.');
              }}
            >
              Export the sales
            </button>
            <span className="hint">
              A sale with no figure is an empty cell, not a nought — it will not add itself in.
            </span>
          </div>
        </div>
      )}

      {client && picked.length > 0 && (
        <div className="art-picks">
          <span className="hint">
            {picked.length === 1 ? '1 piece picked' : `${picked.length} pieces picked`}:{' '}
            {pickedPieces.map((photo) => photo.title).join(', ')}
          </span>
          <div className="chip-row">
            <input
              className="fnd-search"
              type="email"
              placeholder="Your email address"
              aria-label="Your email address"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
            />
            <a
              className="btn"
              data-variant="primary"
              aria-disabled={!sendTo.includes('@')}
              href={sendTo.includes('@') ? mailtoPicks() : undefined}
            >
              Email these to me
            </a>
            <button className="btn" data-variant="quiet" onClick={() => setPicked([])}>
              Start again
            </button>
          </div>
          <span className="hint">
            This opens your own email with the list in it — nothing is sent from here, and the
            studio is not told what you picked unless you send it.
          </span>
        </div>
      )}
    </div>
  );
}

/** The line under a piece in the artist's own view: everything, plainly. */
function studioLine(photo: Photo): string {
  const parts = [
    describeSize(photo),
    photo.medium,
    photo.year ? String(photo.year) : null,
    describePrice(photo),
    describeStatus(photo) ?? 'Status not said',
    photo.location ? describeLocation(photo.location) : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

/** Recording what happened when a piece sold. */
function SaleForm({
  photo,
  onSave,
  onClear,
  onCancel,
}: {
  photo: Photo;
  onSave: (sale: Sale) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const existing = photo.sale ?? null;
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(
    existing?.amount !== null && existing?.amount !== undefined
      ? String(existing.amount / 100)
      : '',
  );
  const [fee, setFee] = useState(
    existing?.fee !== null && existing?.fee !== undefined ? String(existing.fee / 100) : '',
  );
  const [where, setWhere] = useState(existing?.where ?? '');
  const [buyer, setBuyer] = useState(existing?.buyer ?? '');
  const [note, setNote] = useState(existing?.note ?? '');

  const asking = askingInMinor(photo);

  return (
    <div className="art-sale-form">
      <div className="field-row">
        <div className="field">
          <label htmlFor={`sold-on-${photo.id}`}>Sold on</label>
          <input
            id={`sold-on-${photo.id}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`sold-for-${photo.id}`}>Sold for</label>
          <input
            id={`sold-for-${photo.id}`}
            inputMode="decimal"
            value={amount}
            placeholder="Not recorded"
            onChange={(e) => setAmount(e.target.value)}
          />
          {asking !== null && amount.trim() === '' && (
            <button
              className="btn"
              data-variant="quiet"
              onClick={() => setAmount(String(asking / 100))}
            >
              Use the asking price ({formatMoney(asking, photo.currency)})
            </button>
          )}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`sold-where-${photo.id}`}>Where</label>
          <input
            id={`sold-where-${photo.id}`}
            value={where}
            placeholder="Santa Fe show, the gallery, a studio visit"
            onChange={(e) => setWhere(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`sold-buyer-${photo.id}`}>Buyer</label>
          <input
            id={`sold-buyer-${photo.id}`}
            value={buyer}
            placeholder="If they said"
            onChange={(e) => setBuyer(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={`sold-fee-${photo.id}`}>What the gallery or show took</label>
        <input
          id={`sold-fee-${photo.id}`}
          inputMode="decimal"
          value={fee}
          placeholder="Leave blank if none, or if you do not know yet"
          onChange={(e) => setFee(e.target.value)}
        />
        <span className="hint">Blank is not nothing — it means it has not been written down.</span>
      </div>

      <div className="field">
        <label htmlFor={`sold-note-${photo.id}`}>Note</label>
        <input
          id={`sold-note-${photo.id}`}
          value={note}
          placeholder="Anything worth remembering"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="chip-row">
        <button
          className="btn"
          data-variant="primary"
          onClick={() =>
            onSave({
              ...emptySale(date),
              date,
              amount: parseMoney(amount),
              fee: parseMoney(fee),
              where: where.trim() || null,
              buyer: buyer.trim() || null,
              note: note.trim() || null,
            })
          }
        >
          {existing ? 'Save the sale' : 'Record the sale'}
        </button>
        <button className="btn" data-variant="quiet" onClick={onCancel}>
          Cancel
        </button>
        {existing && (
          <button className="btn" data-variant="quiet" onClick={onClear}>
            Remove the sale
          </button>
        )}
      </div>
    </div>
  );
}

function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
