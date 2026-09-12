import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { StudioDefaults } from '../../lib/prefs';
import { describePrice, describeSize, shareMessage, type Photo } from '../../photo/photo';
import { missingFromCard, normaliseUrl, vcardFor } from '../contact';
import {
  csvOf,
  draftProblem,
  emptyDraft,
  mailingList,
  mailtoLink,
  possibleDuplicates,
  removeGuest,
  searchGuests,
  signGuestBook,
  smsLink,
  type GuestDraft,
  type GuestEntry,
} from '../guestbook';

export type ConnectTab = 'guestbook' | 'send' | 'qr';

interface Props {
  tab: ConnectTab;
  onTab: (tab: ConnectTab) => void;
  studio: StudioDefaults;
  photos: Photo[];
  imageUrls: Record<string, string>;
  /** Blob for the picture being sent, so it can go as a real attachment. */
  imageBlob: (imageId: string) => Promise<Blob | null>;
  guests: GuestEntry[];
  onGuests: (guests: GuestEntry[]) => void;
  selectedPhotoId: string | null;
  onSelectPhoto: (id: string | null) => void;
  siteUrl: string;
  onSiteUrl: (url: string) => void;
  onMessage: (text: string) => void;
}

/**
 * Connect: the three things that actually happen at a show.
 *
 * Someone signs the book, someone asks "can you send me that one?", and
 * someone wants the studio's details. All three run on this device — nothing
 * here has a server behind it, and the tool says so rather than implying a
 * send it cannot do. Email and messages are handed to the phone's own apps,
 * which is what makes them work offline in a field in Ohio.
 */
export function Connect(props: Props) {
  return (
    <div className="connect">
      <div className="chip-row connect-tabs">
        <Tab id="guestbook" current={props.tab} onTab={props.onTab}>Guest book</Tab>
        <Tab id="send" current={props.tab} onTab={props.onTab}>Send a picture</Tab>
        <Tab id="qr" current={props.tab} onTab={props.onTab}>QR &amp; contact card</Tab>
      </div>

      {props.tab === 'guestbook' && <GuestBook {...props} />}
      {props.tab === 'send' && <SendPicture {...props} />}
      {props.tab === 'qr' && <QrPanel {...props} />}
    </div>
  );
}

function Tab({
  id,
  current,
  onTab,
  children,
}: {
  id: ConnectTab;
  current: ConnectTab;
  onTab: (tab: ConnectTab) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="btn"
      data-variant={current === id ? 'primary' : 'quiet'}
      aria-current={current === id}
      onClick={() => onTab(id)}
    >
      {children}
    </button>
  );
}

// --- Guest book -----------------------------------------------------------

function GuestBook({ guests, onGuests, studio, onMessage }: Props) {
  const [draft, setDraft] = useState<GuestDraft>(() => emptyDraft());
  const [query, setQuery] = useState('');
  const [warning, setWarning] = useState<string | null>(null);

  const problem = draftProblem(draft);
  const shown = searchGuests(guests, query);
  const list = mailingList(guests);

  const sign = () => {
    if (problem) return;
    const entry = signGuestBook(draft);
    const duplicates = possibleDuplicates(guests, entry);
    onGuests([entry, ...guests]);
    // The same show, the same email: say so, but sign them in anyway. It is
    // not this app's business to tell someone they already signed.
    setWarning(
      duplicates.length > 0
        ? `Signed. ${duplicates[0]!.name} appears to have signed before with the same details.`
        : null,
    );
    // The show name carries to the next visitor: it is the same show all day.
    setDraft(emptyDraft(draft.show));
  };

  return (
    <div className="gb">
      <form
        className="gb-form"
        onSubmit={(e) => {
          e.preventDefault();
          sign();
        }}
      >
        <h3>Sign the book</h3>
        <p className="hint">
          Hand the tablet over, or fill it in yourself. Only a name is needed.
        </p>

        <div className="field">
          <label htmlFor="gb-name">Name</label>
          <input
            id="gb-name"
            value={draft.name}
            autoComplete="off"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="gb-email">Email</label>
            <input
              id="gb-email"
              type="email"
              inputMode="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="gb-phone">Phone</label>
            <input
              id="gb-phone"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="gb-show">Show</label>
          <input
            id="gb-show"
            value={draft.show}
            placeholder="Where you are today"
            onChange={(e) => setDraft({ ...draft, show: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="gb-note">Note</label>
          <textarea
            id="gb-note"
            rows={2}
            value={draft.note}
            placeholder="Which piece they liked, anything worth remembering"
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={draft.consented}
            onChange={(e) => setDraft({ ...draft, consented: e.target.checked })}
          />
          <span>Happy to hear from the studio</span>
        </label>

        <div className="gb-actions">
          <button className="btn" data-variant="primary" type="submit" disabled={Boolean(problem)}>
            Sign the book
          </button>
          {problem && <span className="hint">{problem}</span>}
        </div>
        {warning && <p className="notice">{warning}</p>}
      </form>

      <div className="gb-list">
        <div className="gb-head">
          <h3>{guests.length === 1 ? '1 signature' : `${guests.length} signatures`}</h3>
          <span className="hint">
            {list.length} said you may write to them
          </span>
          <button
            className="btn"
            data-variant="quiet"
            disabled={guests.length === 0}
            onClick={() => {
              downloadText(csvOf(guests), 'guest-book.csv', 'text/csv');
              onMessage('Guest book saved as a CSV you can open in any spreadsheet.');
            }}
          >
            Export CSV
          </button>
        </div>

        <input
          className="fnd-search"
          placeholder="Search the book"
          aria-label="Search the guest book"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {shown.length === 0 ? (
          <div className="empty">
            <h3>{guests.length === 0 ? 'Nobody has signed yet' : 'No match'}</h3>
            <p>
              {guests.length === 0
                ? 'Signatures are kept on this device only — see the QR tab for what a scan can and cannot do.'
                : 'Try part of a name, an email address or a show.'}
            </p>
          </div>
        ) : (
          <ul className="gb-entries">
            {shown.map((entry) => (
              <li key={entry.id}>
                <div className="grow">
                  <strong>{entry.name}</strong>
                  <span className="fnd-detail">
                    {[entry.email, entry.phone, entry.show].filter(Boolean).join(' · ') ||
                      'No contact details left'}
                    {entry.consented ? ' · may contact' : ' · no contact'}
                  </span>
                  {entry.note && <span className="fnd-detail">“{entry.note}”</span>}
                </div>
                {entry.email && (
                  <a
                    className="btn"
                    href={mailtoLink(
                      entry.email,
                      'Lovely to meet you',
                      `Hi ${entry.name.split(' ')[0]},\n\n\n\n— ${studio.name || 'the studio'}`,
                    )}
                  >
                    Email
                  </a>
                )}
                {entry.phone && (
                  <a className="btn" href={smsLink(entry.phone, `Hi ${entry.name.split(' ')[0]}, `)}>
                    Text
                  </a>
                )}
                <button
                  className="btn"
                  data-variant="quiet"
                  onClick={() => onGuests(removeGuest(guests, entry.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Send a picture -------------------------------------------------------

function SendPicture({
  photos,
  imageUrls,
  imageBlob,
  studio,
  selectedPhotoId,
  onSelectPhoto,
  guests,
  onMessage,
}: Props) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const photo = photos.find((p) => p.id === selectedPhotoId) ?? photos[0] ?? null;
  const message = photo ? shareMessage(photo, studio.name || null) : '';
  const canShareFiles =
    typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  if (photos.length === 0) {
    return (
      <div className="empty">
        <h3>No pictures yet</h3>
        <p>Add images on the desktop first — then they can be sent from here.</p>
      </div>
    );
  }

  const share = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      const blob = await imageBlob(photo.imageId);
      const file = blob
        ? new File([blob], `${photo.title.replace(/[^\w -]/g, '') || 'artwork'}.jpg`, {
            type: blob.type || 'image/jpeg',
          })
        : null;

      // The phone's own share sheet: Messages, Mail, AirDrop, WhatsApp — with
      // the picture actually attached, which no mailto: link can do.
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: message, title: photo.title });
        onMessage('Handed to your phone’s share sheet.');
      } else if (navigator.share) {
        await navigator.share({ text: message, title: photo.title });
        onMessage('Shared the details. This browser could not attach the picture.');
      } else {
        onMessage('This browser has no share sheet — use Email, Text, or Save picture below.');
      }
    } catch (cause) {
      // A cancelled share throws too; that is not an error worth shouting about.
      if ((cause as Error)?.name !== 'AbortError') {
        onMessage('The share sheet could not be opened. Email or Text will still work.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="send">
      <div className="send-strip">
        {photos.map((option) => (
          <button
            key={option.id}
            className="send-thumb"
            data-selected={photo?.id === option.id}
            onClick={() => onSelectPhoto(option.id)}
            title={option.title}
          >
            {imageUrls[option.imageId] ? (
              <img src={imageUrls[option.imageId]} alt="" />
            ) : (
              <span className="sheet-face" />
            )}
          </button>
        ))}
      </div>

      {photo && (
        <div className="send-body">
          <figure className="send-preview">
            {imageUrls[photo.imageId] && <img src={imageUrls[photo.imageId]} alt={photo.title} />}
            <figcaption>
              <strong>{photo.title}</strong>
              <span>
                {describeSize(photo) ?? 'Size not recorded'} · {describePrice(photo)}
              </span>
            </figcaption>
          </figure>

          <div className="send-form">
            <div className="field">
              <label htmlFor="send-to">Send to</label>
              <input
                id="send-to"
                value={to}
                placeholder="Email address or mobile number"
                onChange={(e) => setTo(e.target.value)}
                list="send-guests"
              />
              <datalist id="send-guests">
                {guests
                  .filter((guest) => guest.email || guest.phone)
                  .map((guest) => (
                    <option key={guest.id} value={guest.email ?? guest.phone ?? ''}>
                      {guest.name}
                    </option>
                  ))}
              </datalist>
              <span className="hint">Anyone in the guest book will autocomplete here.</span>
            </div>

            <pre className="send-message">{message}</pre>

            <div className="chip-row">
              <button className="btn" data-variant="primary" disabled={busy} onClick={() => void share()}>
                {busy ? 'Opening…' : canShareFiles ? 'Share with the picture' : 'Share'}
              </button>
              <a
                className="btn"
                aria-disabled={!to.includes('@')}
                href={to.includes('@') ? mailtoLink(to, photo.title, message) : undefined}
              >
                Email
              </a>
              <a
                className="btn"
                aria-disabled={to.includes('@') || to.trim() === ''}
                href={!to.includes('@') && to.trim() ? smsLink(to, message) : undefined}
              >
                Text
              </a>
              <button
                className="btn"
                data-variant="quiet"
                onClick={() => {
                  void navigator.clipboard?.writeText(message);
                  onMessage('Details copied. Paste them anywhere.');
                }}
              >
                Copy details
              </button>
              <button
                className="btn"
                data-variant="quiet"
                onClick={() => {
                  const url = imageUrls[photo.imageId];
                  if (url) downloadUrl(url, `${photo.title || 'artwork'}.jpg`);
                }}
              >
                Save picture
              </button>
            </div>

            <p className="hint">
              Email and Text hand off to your own mail and messages apps. An email link cannot carry
              the picture itself — use Share on a phone, or Save picture and attach it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- QR and contact card --------------------------------------------------

function QrPanel({ studio, siteUrl, onSiteUrl, onMessage }: Props) {
  const [mode, setMode] = useState<'card' | 'link'>('card');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  const link = normaliseUrl(siteUrl);
  const payload = mode === 'card' ? vcardFor(studio, link) : link;
  const missing = missingFromCard(studio);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!payload) {
      setError('Type a web address above and the code will appear.');
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    setError(null);
    QRCode.toCanvas(canvas, payload, { width: 260, margin: 1 }).catch((cause: Error) => {
      setError(cause.message);
    });
  }, [payload]);

  return (
    <div className="qr">
      <div className="qr-side">
        <div className="chip-row">
          <button
            className="btn"
            data-variant={mode === 'card' ? 'primary' : 'quiet'}
            onClick={() => setMode('card')}
          >
            Contact card
          </button>
          <button
            className="btn"
            data-variant={mode === 'link' ? 'primary' : 'quiet'}
            onClick={() => setMode('link')}
          >
            Web address
          </button>
        </div>

        <div className="field">
          <label htmlFor="qr-url">Your website</label>
          <input
            id="qr-url"
            value={siteUrl}
            placeholder="mystudio.com"
            onChange={(e) => onSiteUrl(e.target.value)}
          />
          <span className="hint">Used on the contact card, and on its own in Web address mode.</span>
        </div>

        {mode === 'card' && missing.length > 0 && (
          <p className="notice">
            The card is missing {missing.join(' and ')}. Fill that in under Settings before you
            print a sign.
          </p>
        )}

        <p className="hint">
          <strong>What a scan does:</strong> a phone camera reads this and offers to save your
          details, or opens your site. It hands your details <em>out</em>.
        </p>
        <p className="hint">
          It cannot bring anything back. A visitor filling in a form on their own phone would be
          saving it to their phone, not to this app — that needs a server, which this app does not
          have yet. Until then the guest book is this device: keep the tablet on the table and let
          people sign it here.
        </p>
      </div>

      <div className="qr-plate">
        <canvas ref={canvasRef} width={260} height={260} />
        {error && <p className="hint">{error}</p>}
        <div className="chip-row">
          <button
            className="btn"
            disabled={!payload}
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              downloadUrl(canvas.toDataURL('image/png'), 'qr-code.png');
              onMessage('QR code saved. Print it as large as you like — it stays sharp.');
            }}
          >
            Save QR as PNG
          </button>
          {mode === 'card' && (
            <button
              className="btn"
              data-variant="quiet"
              onClick={() => {
                downloadText(vcardFor(studio, link), 'contact.vcf', 'text/vcard');
                onMessage('Contact card saved. Email it to anyone who asks for your details.');
              }}
            >
              Save contact card
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadText(text: string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  downloadUrl(url, fileName);
  // Revoked late: Safari has not finished with the URL when the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadUrl(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
}
