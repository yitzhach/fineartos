import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { describeSize, type Photo } from '../../photo/photo';
import { cssMatrix3d, type Point } from '../geometry';
import { averageRgb, cssFilter, matchLighting, type Rgb } from '../lighting';
import {
  CORNER_NAMES,
  dragCentre,
  isWall,
  pieceTransform,
  pointsNeeded,
  startCentre,
  wallFromMarks,
  type Marks,
} from '../placement';

interface Props {
  photos: Photo[];
  imageUrls: Record<string, string>;
}

/** Element pixels per inch for the drawn piece, so a small piece keeps its detail. */
const UNIT = 12;

/**
 * A piece on a room's wall at true size.
 *
 * The room photo is held for this window only: it is usually a client's room,
 * it is needed for minutes, and keeping it would mean a new store for one
 * picture. Closing the window lets it go, and the window says so.
 *
 * Everything this draws comes from `placement.ts` and `geometry.ts`; this file
 * only turns taps into photo pixels and the answers into CSS.
 */
export function VisualizerWindow({ photos, imageUrls }: Props) {
  const [room, setRoom] = useState<{ url: string; w: number; h: number } | null>(null);
  const [roomProblem, setRoomProblem] = useState<string | null>(null);
  const [marks, setMarks] = useState<Marks>({ mode: 'corners', points: [], widthIn: null, heightIn: null });
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [centre, setCentre] = useState<Point | null>(null);
  const [strength, setStrength] = useState(100);
  const [shadowOn, setShadowOn] = useState(true);
  const [wallRgb, setWallRgb] = useState<Rgb | null>(null);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ kind: 'piece'; from: Point; start: Point } | { kind: 'mark'; index: number } | null>(null);

  // Let the room's object URL go when it is replaced or the window closes.
  useEffect(() => () => { if (room) URL.revokeObjectURL(room.url); }, [room]);

  // The photo is drawn to fit; taps arrive in screen pixels and are kept in photo pixels.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !room) return;
    const measure = () => setScale(el.clientWidth / room.w || 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [room]);

  const wall = useMemo(() => wallFromMarks(marks), [marks]);
  const ready = isWall(wall) ? wall : null;

  const sized = useMemo(
    () => photos.filter((p) => p.widthIn !== null && p.heightIn !== null && p.widthIn > 0 && p.heightIn > 0),
    [photos],
  );
  const unsized = photos.length - sized.length;
  const piece = sized.find((p) => p.id === pieceId) ?? null;
  const pieceSize = piece ? { w: piece.widthIn!, h: piece.heightIn! } : null;

  // A new wall or a new piece starts in the middle again.
  useEffect(() => {
    if (ready && room && pieceSize) setCentre(startCentre(ready, room));
    else setCentre(null);
  }, [ready, room, pieceId]);

  // The room's light, read from the marked wall (or the whole photo) once the
  // scale is set. The photo is decoded once; each reading is a 64px sample.
  const decoded = useRef<HTMLImageElement | null>(null);
  const [decodedFor, setDecodedFor] = useState<string | null>(null);
  useEffect(() => {
    decoded.current = null;
    if (!room) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      decoded.current = img;
      setDecodedFor(room.url);
    };
    img.src = room.url;
    return () => { live = false; };
  }, [room]);
  const sampleKey = room && ready ? JSON.stringify(marks.points.map((p) => [Math.round(p.x), Math.round(p.y)])) : '';
  useEffect(() => {
    const img = decoded.current;
    if (!room || !img || decodedFor !== room.url) return setWallRgb(null);
    const box = sampleBox(marks, room);
    const canvas = document.createElement('canvas');
    const w = Math.max(1, Math.round(Math.min(64, box.w))), h = Math.max(1, Math.round(Math.min(64, box.h)));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return setWallRgb(null);
    ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, w, h);
    try {
      setWallRgb(averageRgb(ctx.getImageData(0, 0, w, h).data));
    } catch {
      setWallRgb(null);
    }
  }, [room, decodedFor, sampleKey]);

  const lighting = matchLighting(wallRgb, strength / 100);

  function pickRoom(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setRoomProblem('That file is not a picture.');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setRoomProblem(null);
      setRoom({ url, w: img.naturalWidth, h: img.naturalHeight });
      setMarks((m) => ({ ...m, points: [] }));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setRoomProblem('That picture could not be opened. Try a JPEG or PNG.');
    };
    img.src = url;
  }

  function toPhoto(e: { clientX: number; clientY: number }): Point {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  function onStageDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!room || marks.points.length >= pointsNeeded(marks.mode)) return;
    const p = toPhoto(e);
    setMarks((m) => ({ ...m, points: [...m.points, p] }));
  }

  function onMarkDown(e: ReactPointerEvent<HTMLElement>, index: number) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: 'mark', index };
  }

  function onPieceDown(e: ReactPointerEvent<HTMLElement>) {
    if (!centre) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: 'piece', from: toPhoto(e), start: centre };
  }

  function onMove(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    const p = toPhoto(e);
    if (d.kind === 'mark') {
      const x = Math.max(0, Math.min(room!.w, p.x)), y = Math.max(0, Math.min(room!.h, p.y));
      setMarks((m) => ({ ...m, points: m.points.map((q, i) => (i === d.index ? { x, y } : q)) }));
    } else if (ready && pieceSize) {
      setCentre(dragCentre(ready, d.start, d.from, p, pieceSize));
    }
  }

  function onUp() {
    drag.current = null;
  }

  function setMode(mode: Marks['mode']) {
    setMarks(
      mode === 'length'
        ? { mode, points: [], inches: marks.mode === 'length' ? marks.inches : null }
        : { mode, points: [], widthIn: marks.mode === 'corners' ? marks.widthIn : null, heightIn: marks.mode === 'corners' ? marks.heightIn : null },
    );
  }

  const pieceUrl = piece ? imageUrls[piece.imageId] : undefined;
  const transform = ready && centre && pieceSize ? cssMatrix3d(pieceTransform(ready, centre, pieceSize, UNIT, scale)) : null;
  const outline = marks.points.map((p) => `${p.x * scale},${p.y * scale}`).join(' ');

  return (
    <div className="viz">
      <section className="viz-steps">
        <div className="viz-step">
          <h3>1 · The room</h3>
          <label className="btn" data-variant={room ? undefined : 'primary'}>
            {room ? 'Choose another photo' : 'Choose a room photo'}
            <input type="file" accept="image/*" hidden onChange={(e) => { pickRoom(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <p className="faint viz-small">Kept in this window only. Closing it lets the photo go; nothing is saved.</p>
          {roomProblem && <p className="viz-problem" role="alert">{roomProblem}</p>}
        </div>

        {room && (
          <div className="viz-step">
            <h3>2 · The scale</h3>
            <div className="viz-modes" role="radiogroup" aria-label="How to give the photo a scale">
              <button type="button" className="btn" role="radio" aria-checked={marks.mode === 'corners'} data-variant={marks.mode === 'corners' ? 'primary' : 'quiet'} onClick={() => setMode('corners')}>
                Wall corners
              </button>
              <button type="button" className="btn" role="radio" aria-checked={marks.mode === 'length'} data-variant={marks.mode === 'length' ? 'primary' : 'quiet'} onClick={() => setMode('length')}>
                A known length
              </button>
            </div>
            {marks.mode === 'corners' ? (
              <div className="viz-fields">
                <label>Wall width (in)<input type="number" inputMode="decimal" min="1" value={marks.widthIn ?? ''} onChange={(e) => setMarks({ ...marks, widthIn: numberOrNull(e.target.value) })} /></label>
                <label>Wall height (in)<input type="number" inputMode="decimal" min="1" value={marks.heightIn ?? ''} onChange={(e) => setMarks({ ...marks, heightIn: numberOrNull(e.target.value) })} /></label>
              </div>
            ) : (
              <div className="viz-fields">
                <label>Marked length (in)<input type="number" inputMode="decimal" min="0.1" value={marks.inches ?? ''} onChange={(e) => setMarks({ ...marks, inches: numberOrNull(e.target.value) })} /></label>
              </div>
            )}
            <p className={ready ? 'faint viz-small' : 'viz-small'} aria-live="polite">
              {ready ? 'Scale set. Drag a mark to adjust it.' : (wall as { missing: string }).missing}
            </p>
            {marks.points.length > 0 && (
              <button type="button" className="btn" data-variant="quiet" onClick={() => setMarks({ ...marks, points: [] })}>
                Clear the marks
              </button>
            )}
          </div>
        )}

        {ready && (
          <div className="viz-step">
            <h3>3 · The piece</h3>
            {sized.length === 0 ? (
              <p className="viz-small">No piece has its size recorded yet. Add a width and height in Artwork and it appears here.</p>
            ) : (
              <select value={pieceId ?? ''} onChange={(e) => setPieceId(e.target.value || null)} aria-label="Piece to place">
                <option value="">Choose a piece…</option>
                {sized.map((p) => (
                  <option key={p.id} value={p.id}>{p.title} — {describeSize(p)}</option>
                ))}
              </select>
            )}
            {unsized > 0 && (
              <p className="faint viz-small">
                {unsized} {unsized === 1 ? 'piece has' : 'pieces have'} no size recorded and {unsized === 1 ? 'is' : 'are'} left out — never placed at a guessed size.
              </p>
            )}
            {piece && (
              <>
                <label className="viz-slider">
                  <span>Match the room&apos;s light · <span className="faint">{strength}%</span></span>
                  <input type="range" min="0" max="100" value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
                </label>
                <label className="viz-check">
                  <input type="checkbox" checked={shadowOn} onChange={(e) => setShadowOn(e.target.checked)} /> Soft shadow
                </label>
                <p className="faint viz-small">Drag the piece to move it along the wall.</p>
              </>
            )}
          </div>
        )}
      </section>

      <div className="viz-view">
        {room ? (
          <div
            ref={stageRef}
            className="viz-stage"
            data-marking={marks.points.length < pointsNeeded(marks.mode) ? 'true' : undefined}
            onPointerDown={onStageDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <img src={room.url} alt="The room" draggable={false} />
            {transform && (
              <div
                className="viz-piece"
                style={{
                  width: pieceSize!.w * UNIT,
                  height: pieceSize!.h * UNIT,
                  transform,
                  filter: cssFilter(lighting),
                  boxShadow: shadowOn ? `0 ${0.5 * UNIT}px ${1.5 * UNIT}px rgba(0,0,0,${lighting.shadow.toFixed(2)})` : 'none',
                }}
                onPointerDown={onPieceDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                aria-label={`${piece!.title}, ${describeSize(piece!)}`}
                role="img"
              >
                {pieceUrl ? <img src={pieceUrl} alt="" draggable={false} /> : <span className="viz-noimage">Picture loading…</span>}
              </div>
            )}
            <svg className="viz-marks" width="100%" height="100%" aria-hidden="true">
              {marks.points.length > 1 && (
                marks.mode === 'corners' && marks.points.length === 4
                  ? <polygon points={outline} />
                  : <polyline points={outline} />
              )}
            </svg>
            {marks.points.map((p, i) => (
              <button
                key={i}
                type="button"
                className="viz-mark"
                style={{ left: p.x * scale, top: p.y * scale }}
                aria-label={marks.mode === 'corners' ? `${CORNER_NAMES[i]} corner` : `End ${i + 1} of the marked length`}
                onPointerDown={(e) => onMarkDown(e, i)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
            ))}
          </div>
        ) : (
          <p className="faint viz-empty">Choose a photo of the wall — the client's room, or your own — to see a piece on it at its real size.</p>
        )}
      </div>
    </div>
  );
}

function numberOrNull(v: string): number | null {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n;
}

/** The part of the photo to read the light from: the marked wall's box, else the whole photo. */
function sampleBox(marks: Marks, room: { w: number; h: number }) {
  if (marks.mode === 'corners' && marks.points.length === 4) {
    const xs = marks.points.map((p) => p.x), ys = marks.points.map((p) => p.y);
    const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
    const w = Math.min(room.w, Math.max(...xs)) - x, h = Math.min(room.h, Math.max(...ys)) - y;
    if (w >= 1 && h >= 1) return { x, y, w, h };
  }
  return { x: 0, y: 0, w: room.w, h: room.h };
}
