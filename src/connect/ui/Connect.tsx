import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { StudioDefaults } from '../../lib/prefs';
import {
  describePrice,
  describeSize,
  describeStatus,
  isInCurrentShow,
  isShownToVisitors,
  shareMessage,
  type Photo,
} from '../../photo/photo';
import { filterCounts, pickedPhotos, picksFor, type PickFilter } from '../picker';
import { missingFromCard, normaliseUrl, vcardFor } from '../contact';
import { countPhrase } from '../../os/trash';
import { Icon } from '../../os/icons';
import { SignatureMark, SignaturePad } from './SignaturePad';
import {
  csvOf,
  hasSignature,
  likeCounts,
  likedOf,
  togglePhotoLike,
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
  /** Files dropped on the picture picker become pictures in the studio. */
  onAddImages: (files: FileList | File[], markCurrentShow: boolean) => void;
  importing: boolean;
  /** Puts a picture in — or takes it out of — the show being worked now. */
  onToggleCurrentShow: (photoId: string, inShow: boolean) => void;
  /** Takes a picture out of what a visitor is shown, or puts it back. */
  onSetVisible: (photoId: string, visible: boolean) => void;
  /** Opens the picture itself, where its price and status are edited. */
  onOpenPhoto: (photoId: string) => void;
  selectedPhotoId: string | null;
  onSelectPhoto: (id: string | null) => void;
  /** Whether the book asks visitors to sign. Off means it does not ask. */
  askForSignature: boolean;
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

function GuestBook({
  guests,
  onGuests,
  studio,
  onMessage,
  photos,
  imageUrls,
  imageBlob,
  onAddImages,
  importing,
  onToggleCurrentShow,
  onSetVisible,
  onOpenPhoto,
  askForSignature,
}: Props) {
  const [draft, setDraft] = useState<GuestDraft>(() => emptyDraft());
  const [query, setQuery] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  /**
   * Guest mode hides the book from whoever is holding the tablet: at a booth
   * the last visitor's phone number should not be on screen while the next
   * one signs. It hides nothing from the artist — the tally and the list are
   * one tap away again.
   */
  const [guestMode, setGuestMode] = useState(false);
  /**
   * Which pictures to put in front of a visitor. "Current show" is what is on
   * the wall in front of them; "Available" is what they could actually buy.
   * Both are things the artist marks on a picture — neither is guessed, so a
   * filter can be honestly empty.
   */
  const [filter, setFilter] = useState<PickFilter>('show');
  const [over, setOver] = useState(false);
  const [sending, setSending] = useState(false);

  const titleOf = (photoId: string) => photos.find((p) => p.id === photoId)?.title ?? 'Picture';
  const tally = likeCounts(guests);

  const counts = filterCounts(photos, { guestMode });
  const shownPhotos = picksFor(photos, filter, { guestMode });
  const picked = pickedPhotos(photos, draft.likedPhotoIds);

  /** An email to one visitor about the pieces they picked. */
  const likedMailto = (entry: GuestEntry) => {
    const picked = pickedPhotos(photos, likedOf(entry));
    const body = [
      `Hi ${entry.name.split(' ')[0]},`,
      '',
      'Lovely to meet you. Here are the pieces you picked out:',
      '',
      ...picked.map((photo) => shareMessage(photo, null)).flatMap((block) => [block, '']),
      // Said plainly, because an email about pictures with no pictures in it
      // looks broken otherwise.
      '(Attach the photographs before sending — Save picture in the Send a picture tab.)',
      '',
      `— ${studio.name || 'the studio'}`,
    ].join('\n');
    return mailtoLink(entry.email ?? '', 'The pieces you liked', body);
  };

  /**
   * The picked pictures, handed over. On a phone that is the share sheet with
   * the files actually attached; anywhere else it saves them, because a
   * mailto: link cannot carry a picture and pretending otherwise is the one
   * thing this tool must not do.
   */
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
  const takeLabel = canShareFiles ? 'Share the picked pictures' : 'Save the picked pictures';

  const takePicked = async () => {
    if (picked.length === 0) return;
    setSending(true);
    try {
      const blobs = await Promise.all(picked.map((photo) => imageBlob(photo.imageId)));
      const files = picked
        .map((photo, index) => {
          const blob = blobs[index];
          if (!blob) return null;
          return new File([blob], `${photo.title.replace(/[^\w -]/g, '') || 'artwork'}.jpg`, {
            type: blob.type || 'image/jpeg',
          });
        })
        .filter((file): file is File => Boolean(file));

      const text = picked.map((photo) => shareMessage(photo, studio.name || null)).join('\n\n');

      if (files.length > 0 && navigator.canShare?.({ files })) {
        await navigator.share({ files, text, title: 'The pieces you picked' });
        onMessage('Handed to your phone’s share sheet.');
        return;
      }

      let saved = 0;
      for (const photo of picked) {
        const url = imageUrls[photo.imageId];
        if (!url) continue;
        downloadUrl(url, `${photo.title || 'artwork'}.jpg`);
        saved += 1;
      }
      onMessage(
        saved === 0
          ? 'Those pictures are still loading — try again in a moment.'
          : `${countPhrase(saved, 'picture')} saved to your downloads. Attach them to an email yourself.`,
      );
    } catch (cause) {
      // A cancelled share throws as well; that is not worth shouting about.
      if ((cause as Error)?.name !== 'AbortError') {
        onMessage('That could not be handed over. Save picture in the Send a picture tab still works.');
      }
    } finally {
      setSending(false);
    }
  };

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
        <div className="gb-title">
          <h3>Sign the book</h3>
          <button
            className="btn"
            data-variant={guestMode ? 'primary' : 'quiet'}
            type="button"
            onClick={() => setGuestMode(!guestMode)}
          >
            {guestMode ? 'Back to the studio view' : 'Guest mode'}
          </button>
        </div>
        <p className="hint">
          {guestMode
            ? 'Hand the tablet over. Nobody else’s details are on screen.'
            : 'Hand the tablet over, or fill it in yourself. Only a name is needed.'}
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

        {photos.length > 0 && (
          <div className="field">
            <label>{guestMode ? 'Which pieces you like' : 'Pieces they liked'}</label>
            <div className="chip-row gb-filters">
              <FilterChip id="show" current={filter} onPick={setFilter} count={counts.show}>
                Current show
              </FilterChip>
              <FilterChip id="available" current={filter} onPick={setFilter} count={counts.available}>
                Available
              </FilterChip>
              <FilterChip id="all" current={filter} onPick={setFilter} count={counts.all}>
                Everything
              </FilterChip>
            </div>

            <div
              className="gb-picks"
              data-over={over}
              data-busy={importing}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                // Dropped here, a picture is in the show being worked now —
                // that is the only reason to drop it on this panel.
                if (e.dataTransfer.files.length > 0) onAddImages(e.dataTransfer.files, filter === 'show');
              }}
            >
              {shownPhotos.map((photo) => {
                const isPicked = draft.likedPhotoIds.includes(photo.id);
                const inShow = isInCurrentShow(photo);
                const visible = isShownToVisitors(photo);
                return (
                  <div key={photo.id} className="gb-pick-wrap">
                    <button
                      type="button"
                      className="gb-pick"
                      data-picked={isPicked}
                      data-hidden={!visible}
                      aria-pressed={isPicked}
                      onClick={() => setDraft((current) => togglePhotoLike(current, photo.id))}
                      /* A double click opens the picture itself, so its price
                         or status can be changed without going to find it.
                         The two clicks underneath toggle the like on and
                         straight back off again, so the visitor's picks are
                         where they were. */
                      onDoubleClick={() => onOpenPhoto(photo.id)}
                      title={`${photo.title} — double click to open it`}
                    >
                      {imageUrls[photo.imageId] ? (
                        <img src={imageUrls[photo.imageId]} alt={photo.title} />
                      ) : (
                        <span className="sheet-face" />
                      )}
                      <span className="gb-pick-name">{photo.title}</span>
                      <span className="gb-pick-detail">
                        {describeStatus(photo) ?? describePrice(photo)}
                      </span>
                      {isPicked && <span className="gb-tick" aria-hidden="true">✓</span>}
                    </button>

                    {/* The artist's eye, over the corner of the thumbnail: it
                        takes a picture out of what a visitor is shown without
                        deleting anything. Dimmed here, gone in guest mode. */}
                    {!guestMode && (
                      <button
                        type="button"
                        className="gb-eye"
                        data-off={!visible}
                        aria-pressed={!visible}
                        onClick={() => onSetVisible(photo.id, !visible)}
                        title={
                          visible
                            ? `Hide ${photo.title} from visitors`
                            : `Show ${photo.title} to visitors again`
                        }
                      >
                        <Icon name={visible ? 'eye' : 'eye-off'} size={15} />
                        <span className="sr-only">
                          {visible ? 'Shown to visitors' : 'Hidden from visitors'}
                        </span>
                      </button>
                    )}

                    {/* Only the artist sees this: putting a piece in the show
                        is studio work, not something a visitor should do. */}
                    {!guestMode && (
                      <button
                        type="button"
                        className="gb-show-toggle"
                        data-on={inShow}
                        aria-pressed={inShow}
                        onClick={() => onToggleCurrentShow(photo.id, !inShow)}
                        title={
                          inShow
                            ? 'In the current show — click to take it out'
                            : 'Add to the current show'
                        }
                      >
                        {inShow ? '✓ In show' : '+ Add to show'}
                      </button>
                    )}
                  </div>
                );
              })}

              {shownPhotos.length === 0 && (
                <p className="hint gb-picks-empty">
                  {importing
                    ? 'Adding…'
                    : photos.length > 0 && filterCounts(photos, { guestMode: false })[filter] > 0
                      ? 'Every picture here is hidden from visitors at the moment. Turn one back on with the eye in its corner.'
                      : filter === 'show'
                        ? 'Nothing is marked as being in the current show yet. Open a picture and tick “In the current show”, or drop photographs here.'
                        : filter === 'available'
                          ? 'Nothing is marked available yet. Open a picture and set its status.'
                          : 'No pictures yet. Drop photographs here, or use Add images on the desktop.'}
                </p>
              )}
            </div>
            {picked.length === 0 ? (
              <span className="hint">
                Tap any you like. Tap again to change your mind. Double click one to open it.
                Photographs can be dropped here too.
              </span>
            ) : (
              <div className="gb-picked">
                <span className="hint">
                  {countPhrase(picked.length, 'picture')} picked: {picked.map((p) => p.title).join(', ')}
                </span>
                <div className="chip-row">
                  <button
                    className="btn"
                    data-variant="quiet"
                    type="button"
                    disabled={sending}
                    onClick={() => void takePicked()}
                  >
                    {sending ? 'Getting them ready…' : takeLabel}
                  </button>
                  <button
                    className="btn"
                    data-variant="quiet"
                    type="button"
                    onClick={() => setDraft({ ...draft, likedPhotoIds: [] })}
                  >
                    Clear the picks
                  </button>
                </div>
                <span className="hint">
                  Nothing is sent from here. This hands the pictures to your own phone or saves
                  them; signing the book keeps the list with the visitor’s details.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="gb-note">Note</label>
          <textarea
            id="gb-note"
            rows={2}
            value={draft.note}
            placeholder={
              guestMode
                ? 'Anything you would like to say'
                : 'Anything worth remembering about this visitor'
            }
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </div>

        {askForSignature && (
          <div className="field">
            <label>Sign our guest book</label>
            <SignaturePad
              paths={draft.signaturePaths}
              onChange={(signaturePaths) => setDraft({ ...draft, signaturePaths })}
            />
          </div>
        )}

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

      {guestMode ? (
        <div className="gb-list">
          <div className="empty">
            <h3>Guest mode</h3>
            <p>
              The book is hidden while the tablet is being handed round. Tap “Back to the studio
              view” to see it again — {countPhrase(guests.length, 'signature')} so far.
            </p>
          </div>
        </div>
      ) : (
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
              downloadText(csvOf(guests, titleOf), 'guest-book.csv', 'text/csv');
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

        {tally.length > 0 && (
          <div className="gb-tally">
            <h4>Most liked</h4>
            <ol>
              {tally.slice(0, 5).map(({ photoId, count }) => (
                <li key={photoId}>
                  <span className="gb-tally-name">{titleOf(photoId)}</span>
                  <span className="gb-tally-count">
                    {count} {count === 1 ? 'vote' : 'votes'}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

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
                  {hasSignature(entry) && <SignatureMark paths={entry.signaturePaths ?? []} />}
                  {likedOf(entry).length > 0 && (
                    <span className="fnd-detail">
                      Liked: {likedOf(entry).map(titleOf).join(', ')}
                    </span>
                  )}
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
                {entry.email && likedOf(entry).length > 0 && (
                  <a className="btn" data-variant="primary" href={likedMailto(entry)}>
                    Email what they liked
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
      )}
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


function FilterChip({
  id,
  current,
  count,
  onPick,
  children,
}: {
  id: PickFilter;
  current: PickFilter;
  count: number;
  onPick: (id: PickFilter) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn"
      data-variant={current === id ? 'primary' : 'quiet'}
      aria-current={current === id}
      onClick={() => onPick(id)}
    >
      {children} <span className="chip-count">{count}</span>
    </button>
  );
}
