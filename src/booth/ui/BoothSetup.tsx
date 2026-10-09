import { useState } from 'react';
import {
  MAX_IDLE_SECONDS,
  MAX_SLIDE_SECONDS,
  MIN_IDLE_SECONDS,
  MIN_SLIDE_SECONDS,
  boothPanels,
  boothPieces,
  parseBooth,
  pinProblem,
  startProblem,
  withPin,
  PANEL_LABELS,
  type BoothSettings,
} from '../booth';
import { readBoothRaw, writeBoothRaw } from '../storage';
import { normaliseUrl } from '../../connect/contact';
import type { Photo } from '../../photo/photo';

interface Props {
  siteUrl: string;
  photos: Photo[];
  showPieceIds: string[];
  onStart: () => void;
  onMessage: (text: string) => void;
  profileVideoUrl: string | null;
  onProfileVideo: (file: Blob | null) => Promise<void>;
}

/** The largest attract-loop video kept on the device, in megabytes. */
export const MAX_VIDEO_MB = 350;

/** Where the artist gets the booth ready: PIN, statement, website, timings. */
export function BoothSetup({ siteUrl, photos, showPieceIds, onStart, onMessage, profileVideoUrl, onProfileVideo }: Props) {
  const [settings, setSettings] = useState<BoothSettings>(() => parseBooth(readBoothRaw()));
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [pinNote, setPinNote] = useState<string | null>(null);
  const [checkingSite, setCheckingSite] = useState(false);
  const link = normaliseUrl(siteUrl);

  const save = (next: BoothSettings) => {
    setSettings(next);
    const problem = writeBoothRaw(next);
    if (problem) onMessage(problem);
  };

  const pieces = boothPieces(photos, showPieceIds);
  const cannotStart = startProblem(settings);

  return (
    <div className="booth-setup">
      <p className="hint">
        Booth mode fills the screen with the attract loop and visitor panels only — the studio's money, clients and
        notes are out of reach until your PIN is entered. It runs offline.
      </p>

      <section>
        <h3>PIN {settings.pinHash ? '· set' : '· not set'}</h3>
        <div className="booth-setup-row">
          <input type="password" inputMode="numeric" placeholder="New PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
          <input type="password" inputMode="numeric" placeholder="Again" value={again} onChange={(e) => setAgain(e.target.value)} />
          <button className="btn"
            type="button"
            onClick={async () => {
              const problem = pinProblem(pin, again);
              setPinNote(problem);
              if (problem) return;
              save(await withPin(settings, pin));
              setPin('');
              setAgain('');
              setPinNote('PIN saved. Remember it — there is no reset except this screen.');
            }}
          >
            {settings.pinHash ? 'Change PIN' : 'Set PIN'}
          </button>
        </div>
        {pinNote && <p className="hint" role="status">{pinNote}</p>}
        <p className="hint">
          The PIN keeps a passer-by out of the studio. It is not a lock on the tablet: the browser itself can still be
          closed.
        </p>
      </section>

      <section>
        <h3>Artist statement</h3>
        <textarea
          rows={5}
          value={settings.statement}
          placeholder="Left blank, the booth has no statement panel."
          onChange={(e) => save({ ...settings, statement: e.target.value })}
        />
      </section>

      <section>
        <h3>Your website</h3>
        {!link ? (
          <p className="hint">No web address yet — add one on the QR &amp; contact card tab.</p>
        ) : (
          <>
            <p className="hint">
              Many sites refuse to be shown inside another page, and the browser will not say so. Look below: if your
              site appears, tick the box. If not, the booth shows its QR code instead.
            </p>
            {checkingSite ? (
              <iframe className="booth-site-check" src={link} title="Your website, as the booth would show it" />
            ) : (
              <button className="btn" type="button" onClick={() => setCheckingSite(true)}>
                Try showing {link}
              </button>
            )}
            <label className="booth-setup-check">
              <input
                type="checkbox"
                checked={settings.siteShowsInside}
                onChange={(e) => save({ ...settings, siteShowsInside: e.target.checked })}
              />
              I can see my site above — show it in the booth
            </label>
          </>
        )}
      </section>

      <section>
        <h3>Attract loop video</h3>
        <p className="hint">
          Optional. A short clip of your work plays muted, looping, in place of the slideshow. MP4 or WebM, up to{' '}
          {MAX_VIDEO_MB} MB, kept on this device. For a smooth loop, 1080p at about 40 MB a minute is plenty: a
          1–2 minute clip is 40–80 MB. Bigger files save slowly and can stutter on an older tablet.
        </p>
        {profileVideoUrl && <video className="booth-setup-video" src={profileVideoUrl} muted loop playsInline controls />}
        <div className="booth-setup-row">
          <label className="button">
            {profileVideoUrl ? 'Replace video' : 'Choose a video'}
            <input
              type="file"
              accept="video/mp4,video/webm"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
                  onMessage(`That video is ${Math.round(file.size / 1048576)} MB. Keep it under ${MAX_VIDEO_MB} MB.`);
                  return;
                }
                try {
                  await onProfileVideo(file);
                  onMessage('Attract loop video saved.');
                } catch {
                  onMessage('The video could not be saved. Nothing else was changed.');
                }
              }}
            />
          </label>
          {profileVideoUrl && (
            <button
              onClick={async () => {
                await onProfileVideo(null);
                onMessage('Video removed. The loop goes back to the slideshow.');
              }}
            >
              Remove video
            </button>
          )}
        </div>
      </section>

      <section>
        <h3>Timing</h3>
        <label className="booth-setup-row">
          Back to the loop after
          <input
            type="number"
            min={MIN_IDLE_SECONDS}
            max={MAX_IDLE_SECONDS}
            value={settings.idleSeconds}
            onChange={(e) => save(parseBooth({ ...settings, idleSeconds: Number(e.target.value) }))}
          />
          seconds untouched
        </label>
        <label className="booth-setup-row">
          Each piece in the loop for
          <input
            type="number"
            min={MIN_SLIDE_SECONDS}
            max={MAX_SLIDE_SECONDS}
            value={settings.slideSeconds}
            onChange={(e) => save(parseBooth({ ...settings, slideSeconds: Number(e.target.value) }))}
          />
          seconds
        </label>
      </section>

      <section>
        <h3>What visitors get</h3>
        <p className="hint">
          {boothPanels(settings, link).map((id) => PANEL_LABELS[id]).join(' · ')}. The loop and “The work” show{' '}
          {pieces.length === 1 ? '1 piece' : `${pieces.length} pieces`} — those taken to today's show or marked as
          hanging now, minus any hidden from visitors.
        </p>
      </section>

      {cannotStart && <p className="hint" role="status">{cannotStart}</p>}
      <button type="button" data-variant="primary" className="btn" disabled={!!cannotStart} onClick={onStart}>
        Start booth mode
      </button>
    </div>
  );
}
