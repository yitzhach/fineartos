import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PANEL_LABELS,
  boothPanels,
  boothPieces,
  boothPriceLine,
  isIdle,
  lockoutSeconds,
  parseBooth,
  pinMatches,
  slideAt,
  type BoothPanel,
} from '../booth';
import { readBoothRaw } from '../storage';
import { addEntry, draftProblem, emptyDraft, signGuestBook, togglePhotoLike, type GuestEntry } from '../../connect/guestbook';
import { normaliseUrl, vcardFor } from '../../connect/contact';
import { describePhoto, type Photo } from '../../photo/photo';
import type { StudioDefaults } from '../../lib/prefs';

interface Props {
  studio: StudioDefaults;
  siteUrl: string;
  photos: Photo[];
  imageUrls: Record<string, string>;
  /** The artist's attract-loop video, if one is kept. It plays in place of the slideshow. */
  profileVideoUrl: string | null;
  guests: GuestEntry[];
  onGuests: (guests: GuestEntry[]) => void;
  showName: string | null;
  showPieceIds: string[];
  onExit: () => void;
}

/**
 * The booth: the attract loop until a tap, then visitor panels only. The
 * studio's money, clients and notes are not drawn at all while this is up,
 * and the shell's keys are held back. Leaving takes the artist's PIN.
 */
export function BoothMode(props: Props) {
  const settings = useMemo(() => parseBooth(readBoothRaw()), []);
  const link = normaliseUrl(props.siteUrl);
  const panels = boothPanels(settings, link);
  const pieces = boothPieces(props.photos, props.showPieceIds);

  const [awake, setAwake] = useState(false);
  const [panel, setPanel] = useState<BoothPanel>('guestbook');
  const [pinOpen, setPinOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastTouch = useRef(Date.now());
  const loopStart = useRef(Date.now());
  /** Bumped when the loop returns, so a half-typed entry is wiped for the next visitor. */
  const [visit, setVisit] = useState(0);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (isIdle(lastTouch.current, t, settings.idleSeconds)) {
        setAwake((was) => {
          if (was) {
            loopStart.current = t;
            setVisit((v) => v + 1);
            setPinOpen(false);
            setPanel('guestbook');
          }
          return false;
        });
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [settings.idleSeconds]);

  // Hold back the shell's shortcuts and undo while the booth is up. Typing in
  // the booth's own fields still works; nothing reaches the studio behind it.
  useEffect(() => {
    const hold = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (event.ctrlKey || event.metaKey || event.altKey || !typing) event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', hold, true);
    return () => window.removeEventListener('keydown', hold, true);
  }, []);

  const touched = () => {
    lastTouch.current = Date.now();
  };

  if (!awake) {
    const index = slideAt(pieces.length, loopStart.current, now, settings.slideSeconds);
    const piece = index >= 0 ? pieces[index] : undefined;
    const url = piece ? props.imageUrls[piece.imageId] : undefined;
    return (
      <div
        className="booth booth-loop"
        role="button"
        tabIndex={0}
        aria-label="Tap to begin"
        onPointerDown={() => {
          touched();
          setAwake(true);
        }}
      >
        {props.profileVideoUrl ? (
          <video className="booth-slide" src={props.profileVideoUrl} autoPlay muted loop playsInline />
        ) : (
          url && <img key={piece?.id} className="booth-slide" src={url} alt="" />
        )}
        <div className="booth-loop-caption">
          <h1>{props.studio.name || 'Welcome'}</h1>
          {piece && <p>{piece.title} · {boothPriceLine(piece)}</p>}
          <p className="booth-tap">Tap anywhere to sign the book and see the work</p>
        </div>
      </div>
    );
  }

  return (
    <div className="booth" onPointerDown={touched} onKeyDown={touched}>
      <header className="booth-tabs" role="tablist">
        {panels.map((id) => (
          <button className="btn"
            key={id}
            type="button"
            role="tab"
            aria-selected={panel === id}
            data-variant={panel === id ? 'primary' : 'quiet'}
            onClick={() => setPanel(id)}
          >
            {PANEL_LABELS[id]}
          </button>
        ))}
        <button type="button" className="btn booth-artist" data-variant="quiet" onClick={() => setPinOpen(true)} aria-label="Artist: leave booth mode">
          Artist
        </button>
      </header>
      <main className="booth-body">
        {panel === 'guestbook' && (
          <BoothGuestBook
            key={visit}
            guests={props.guests}
            onGuests={props.onGuests}
            showName={props.showName}
            pieces={pieces}
            imageUrls={props.imageUrls}
          />
        )}
        {panel === 'pieces' && <BoothPieces pieces={pieces} imageUrls={props.imageUrls} />}
        {panel === 'statement' && (
          <article className="booth-statement">
            <h2>{props.studio.name || 'About the artist'}</h2>
            {settings.statement.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </article>
        )}
        {panel === 'website' && link && (
          <iframe className="booth-site" src={link} title="The artist's website" sandbox="allow-scripts allow-same-origin allow-forms" />
        )}
        {panel === 'qr' && <BoothQr studio={props.studio} link={link} />}
      </main>
      {pinOpen && <PinPad onCancel={() => setPinOpen(false)} check={(pin) => pinMatches(settings, pin)} onExit={props.onExit} />}
    </div>
  );
}

function BoothGuestBook({
  guests,
  onGuests,
  showName,
  pieces,
  imageUrls,
}: {
  guests: GuestEntry[];
  onGuests: (guests: GuestEntry[]) => void;
  showName: string | null;
  pieces: Photo[];
  imageUrls: Record<string, string>;
}) {
  const [draft, setDraft] = useState(() => emptyDraft(showName ?? ''));
  const [problem, setProblem] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);

  if (thanks) {
    return (
      <div className="booth-thanks">
        <h2>Thank you, {thanks}.</h2>
        <p>You are in the book.</p>
        <button className="btn" type="button" data-variant="primary" onClick={() => setThanks(null)}>
          Next visitor
        </button>
      </div>
    );
  }

  return (
    <form
      className="booth-form"
      onSubmit={(event) => {
        event.preventDefault();
        const why = draftProblem(draft);
        setProblem(why);
        if (why) return;
        const entry = signGuestBook(draft);
        onGuests(addEntry(guests, entry));
        setThanks(entry.name);
        setDraft(emptyDraft(showName ?? ''));
      }}
    >
      <h2>Sign the book</h2>
      <label>
        Name
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoComplete="off" />
      </label>
      <label>
        Email <span className="hint">optional</span>
        <input type="email" inputMode="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} autoComplete="off" />
      </label>
      <label>
        Phone <span className="hint">optional</span>
        <input type="tel" inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} autoComplete="off" />
      </label>
      <label>
        A note <span className="hint">optional</span>
        <textarea rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </label>
      {pieces.length > 0 && (
        <fieldset className="booth-likes">
          <legend>
            Pieces you like <span className="hint">optional</span>
          </legend>
          {pieces.map((piece) => (
            <button
              key={piece.id}
              type="button"
              className="btn"
              aria-pressed={draft.likedPhotoIds.includes(piece.id)}
              data-variant={draft.likedPhotoIds.includes(piece.id) ? 'primary' : 'quiet'}
              onClick={() => setDraft(togglePhotoLike(draft, piece.id))}
            >
              {imageUrls[piece.imageId] && <img src={imageUrls[piece.imageId]} alt="" />}
              {piece.title}
            </button>
          ))}
        </fieldset>
      )}
      <label className="booth-consent">
        <input type="checkbox" checked={draft.consented} onChange={(e) => setDraft({ ...draft, consented: e.target.checked })} />
        Yes, the studio may contact me about new work.
      </label>
      {problem && <p className="booth-problem" role="alert">{problem}</p>}
      <button className="btn" type="submit" data-variant="primary">Sign</button>
      <p className="hint">Kept on this tablet only. Nothing is sent anywhere.</p>
    </form>
  );
}

function BoothPieces({ pieces, imageUrls }: { pieces: Photo[]; imageUrls: Record<string, string> }) {
  if (pieces.length === 0) return <p className="booth-empty">The work is on the walls around you.</p>;
  return (
    <ul className="booth-pieces">
      {pieces.map((piece) => (
        <li key={piece.id}>
          {imageUrls[piece.imageId] ? <img src={imageUrls[piece.imageId]} alt={piece.title} /> : <div className="booth-noimg" />}
          <strong>{piece.title}</strong>
          <span>{describePhoto(piece)}</span>
          <span className="booth-price">{boothPriceLine(piece)}</span>
        </li>
      ))}
    </ul>
  );
}

function BoothQr({ studio, link }: { studio: StudioDefaults; link: string | null }) {
  const cardRef = useRef<HTMLCanvasElement>(null);
  const siteRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const fail = (cause: Error) => setError(`The code could not be drawn: ${cause.message}`);
    if (cardRef.current) QRCode.toCanvas(cardRef.current, vcardFor(studio, link), { width: 240, margin: 1 }).catch(fail);
    if (siteRef.current && link) QRCode.toCanvas(siteRef.current, link, { width: 240, margin: 1 }).catch(fail);
  }, [studio, link]);
  return (
    <div className="booth-qr">
      <figure>
        <canvas ref={cardRef} />
        <figcaption>Scan to save my contact card</figcaption>
      </figure>
      {link && (
        <figure>
          <canvas ref={siteRef} />
          <figcaption>Scan for my website</figcaption>
        </figure>
      )}
      {error && <p className="booth-problem" role="alert">{error}</p>}
      <p className="hint">Your phone reads the code. Nothing comes back to this tablet.</p>
    </div>
  );
}

function PinPad({ check, onCancel, onExit }: { check: (pin: string) => Promise<boolean>; onCancel: () => void; onExit: () => void }) {
  const [pin, setPin] = useState('');
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const waitLeft = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));

  useEffect(() => {
    if (waitLeft <= 0) return;
    const t = window.setTimeout(() => redraw((n) => n + 1), 1000);
    return () => window.clearTimeout(t);
  }, [waitLeft]);

  const submit = async () => {
    if (waitLeft > 0 || !pin) return;
    if (await check(pin)) {
      onExit();
      return;
    }
    const next = failures + 1;
    setFailures(next);
    setPin('');
    const wait = lockoutSeconds(next);
    if (wait > 0) setLockedUntil(Date.now() + wait * 1000);
    setMessage('That is not the PIN.');
  };

  return (
    <div className="booth-pin" role="dialog" aria-modal="true" aria-label="Enter the artist's PIN">
      <div className="booth-pin-card">
        <h2>Artist's PIN</h2>
        <output className="booth-pin-dots" aria-label={`${pin.length} digits entered`}>
          {pin.length ? '•'.repeat(pin.length) : ' '}
        </output>
        {waitLeft > 0 ? <p className="booth-problem">Wait {waitLeft} s before trying again.</p> : message && <p className="booth-problem">{message}</p>}
        <div className="booth-keys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((key) => (
            <button className="btn"
              key={key}
              type="button"
              disabled={waitLeft > 0}
              data-variant={key === 'OK' ? 'primary' : 'quiet'}
              onClick={() => {
                if (key === 'OK') void submit();
                else if (key === '⌫') setPin(pin.slice(0, -1));
                else if (pin.length < 12) setPin(pin + key);
              }}
            >
              {key}
            </button>
          ))}
        </div>
        <button className="btn" type="button" data-variant="quiet" onClick={onCancel}>
          Back to the booth
        </button>
      </div>
    </div>
  );
}
