import { useRef, useState } from 'react';
import { pathFromPoints, SIGNATURE_HEIGHT, SIGNATURE_WIDTH } from '../guestbook';

interface Props {
  paths: string[];
  onChange: (paths: string[]) => void;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Signing by hand — mouse, stylus or finger.
 *
 * Drawn as SVG rather than onto a canvas: the strokes stay as path data, so
 * a signature is a few hundred bytes, scales to any size without going soft,
 * and prints sharp. Pointer events cover all three inputs at once, and
 * `touch-action: none` in the stylesheet is what stops a finger scrolling the
 * window instead of drawing.
 */
export function SignaturePad({ paths, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  /**
   * The stroke being drawn lives in a ref, with state only mirroring it for
   * the redraw. Pointer events can arrive faster than React commits state,
   * and a pen that drops points because a re-render had not landed yet is
   * not a pen.
   */
  const points = useRef<Point[]>([]);
  const drawing = useRef(false);
  const [stroke, setStroke] = useState<Point[]>([]);

  const pointFrom = (event: React.PointerEvent): Point | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    // The box on screen can be any size; the strokes are stored in the
    // signature's own coordinates so they redraw at any width.
    return {
      x: ((event.clientX - box.left) / box.width) * SIGNATURE_WIDTH,
      y: ((event.clientY - box.top) / box.height) * SIGNATURE_HEIGHT,
    };
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const path = pathFromPoints(points.current);
    points.current = [];
    setStroke([]);
    if (path) onChange([...paths, path]);
  };

  const live = pathFromPoints(stroke);

  return (
    <div className="sign">
      <svg
        ref={svgRef}
        className="sign-pad"
        viewBox={`0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}`}
        role="img"
        aria-label="Signature area"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = pointFrom(event);
          if (!point) return;
          drawing.current = true;
          points.current = [point];
          setStroke(points.current);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const point = pointFrom(event);
          if (!point) return;
          points.current = [...points.current, point];
          setStroke(points.current);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={finish}
      >
        <line className="sign-rule" x1="18" y1="94" x2={SIGNATURE_WIDTH - 18} y2="94" />
        {paths.map((path, index) => (
          <path key={index} className="sign-ink" d={path} />
        ))}
        {live && <path className="sign-ink" d={live} />}
      </svg>

      <div className="sign-actions">
        <span className="hint">
          {paths.length === 0 && stroke.length === 0
            ? 'Sign above with a finger, a stylus or the mouse — or skip it.'
            : 'Thank you.'}
        </span>
        <button
          type="button"
          className="btn"
          data-variant="quiet"
          disabled={paths.length === 0}
          onClick={() => onChange([])}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/** The same strokes, drawn small, for the list of who has signed. */
export function SignatureMark({ paths }: { paths: string[] }) {
  return (
    <svg
      className="sign-mark"
      viewBox={`0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}`}
      aria-label="Signature"
      role="img"
    >
      {paths.map((path, index) => (
        <path key={index} className="sign-ink" d={path} />
      ))}
    </svg>
  );
}
