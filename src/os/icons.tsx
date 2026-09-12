/**
 * The dock's icons.
 *
 * Drawn rather than typed. The glyphs this replaces were characters borrowed
 * from a font — ⌂, ✎, ❑ — which meant every one sat on a different baseline
 * at a different weight, and the row read as uneven no matter what the CSS
 * did. These share one 24×24 grid, one stroke weight, one set of caps and
 * joins, so they line up because they are built to.
 *
 * Each says what its tool is for rather than gesturing at it: Invoices is a
 * bill with a total ruled off, Shows is a piece hung on a wall with a floor
 * line, Finance is money over time. Stroke follows the text colour, so a
 * selected tile inverts with everything else.
 */

export type IconName =
  | 'new'
  | 'home'
  | 'projects'
  | 'invoices'
  | 'finder'
  | 'connect'
  | 'shows'
  | 'artwork'
  | 'visualizer'
  | 'finance'
  | 'eye'
  | 'eye-off'
  | 'trash';

interface Props {
  name: IconName;
  /** Drawn at the tile's size; the tile scales, not the artwork. */
  size?: number;
}

export function Icon({ name, size = 22 }: Props) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

const paths: Record<IconName, JSX.Element> = {
  // Shown to a visitor, and the same eye struck through when it is not.
  eye: (
    <>
      <path d="M2.8 12S6.4 5.9 12 5.9 21.2 12 21.2 12 17.6 18.1 12 18.1 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M9.6 6.3A8.6 8.6 0 0 1 12 5.9c5.6 0 9.2 6.1 9.2 6.1a17 17 0 0 1-2.7 3.4" />
      <path d="M6.1 8A17 17 0 0 0 2.8 12S6.4 18.1 12 18.1a8.7 8.7 0 0 0 3.4-.7" />
      <path d="M10 10a2.9 2.9 0 0 0 4 4" />
      <path d="M4.4 4.4 19.6 19.6" />
    </>
  ),
  // A fresh sheet with a pencil laid across it: start a new commission.
  new: (
    <>
      <path d="M13.5 3.5H6.2A1.7 1.7 0 0 0 4.5 5.2v13.6a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7v-4.3" />
      <path d="M7.8 8.2h5.4M7.8 11.6h3.4" />
      <path d="m20.1 4.4-6.6 6.6-2.3.6.6-2.3 6.6-6.6a1.2 1.2 0 0 1 1.7 1.7Z" />
    </>
  ),

  // The studio itself: a desk with the work on it, not a house.
  home: (
    <>
      <path d="M3.2 8.4 12 3.2l8.8 5.2" />
      <path d="M5.4 10v9.2a.9.9 0 0 0 .9.9h11.4a.9.9 0 0 0 .9-.9V10" />
      <path d="M9.7 20.1v-5.3h4.6v5.3" />
    </>
  ),

  // Stacked project folders: the one in front is open at the top.
  projects: (
    <>
      <path d="M3.4 8.6V6.4a1.3 1.3 0 0 1 1.3-1.3h3.4l1.8 2h6.4a1.3 1.3 0 0 1 1.3 1.3v1.2" />
      <path d="M3.4 9.8h17.2l-1.7 8.4a1.3 1.3 0 0 1-1.3 1.1H6.4a1.3 1.3 0 0 1-1.3-1.1Z" />
    </>
  ),

  // A bill: lines of items, then a rule and the total.
  invoices: (
    <>
      <path d="M6 2.8h9.2L19 6.6v13.3a1.3 1.3 0 0 1-1.3 1.3H6a1.3 1.3 0 0 1-1.3-1.3V4.1A1.3 1.3 0 0 1 6 2.8Z" />
      <path d="M14.6 2.9v3.9h4" />
      <path d="M7.6 10.4h8M7.6 13.2h5.4" />
      <path d="M7.6 16.6h8.8" />
      <path d="M12.9 18.6h3.5" />
    </>
  ),

  // Two panes and a lens: browsing everything in the studio.
  finder: (
    <>
      <rect x="3.2" y="4.4" width="17.6" height="15.2" rx="1.6" />
      <path d="M9.1 4.4v15.2" />
      <circle cx="14.4" cy="11" r="2.5" />
      <path d="m16.4 13.1 1.9 2" />
    </>
  ),

  // A card with a signal coming off it: hand your details out, at a booth.
  connect: (
    <>
      <rect x="2.6" y="6.2" width="12.6" height="11.6" rx="1.6" />
      <circle cx="7.2" cy="10.8" r="1.7" />
      <path d="M4.6 15.3c.5-1.4 1.5-2.1 2.6-2.1s2.1.7 2.6 2.1" />
      <path d="M18.2 8.6a5 5 0 0 1 0 6.8M20.8 6.1a8.4 8.4 0 0 1 0 11.8" />
    </>
  ),

  // A piece hung on a wall, with the floor line under it.
  shows: (
    <>
      <rect x="6.4" y="4.2" width="11.2" height="9.4" rx="0.9" />
      <path d="m8.9 11.4 2.3-2.8 1.8 2.1 1.4-1.3 1.7 2" />
      <path d="M3.4 17.4h17.2" />
      <path d="M8.2 17.4v3M15.8 17.4v3" />
    </>
  ),

  // An easel: the thing the work is actually made on.
  artwork: (
    <>
      <rect x="5" y="3.2" width="14" height="10.2" rx="0.9" />
      <path d="M12 13.4v3.1" />
      <path d="m12 16.5-4.6 4.3M12 16.5l4.6 4.3" />
      <path d="M8.2 7.9h7.6" />
    </>
  ),

  // A wall with a frame on it and the room's measure: seeing it in place.
  visualizer: (
    <>
      <path d="M3.2 5.2v13.6M20.8 5.2v13.6" />
      <rect x="7.6" y="7.4" width="8.8" height="7.2" rx="0.8" />
      <path d="M3.2 12h3.2M17.6 12h3.2" />
      <path d="M9.6 18.8h4.8" />
    </>
  ),

  // Money over time: a rising line with a coin at the end of it.
  finance: (
    <>
      <path d="M3.6 19.2V5.4" />
      <path d="M3.6 19.2h16.8" />
      <path d="m6.6 15.6 3.5-3.9 2.8 2.2 3.4-4.6" />
      <circle cx="17.6" cy="7.2" r="2.1" />
    </>
  ),

  // A bin with its lid and the ridges down the front.
  trash: (
    <>
      <path d="M4.6 6.8h14.8" />
      <path d="M9.6 6.8V5.2a1.2 1.2 0 0 1 1.2-1.2h2.4a1.2 1.2 0 0 1 1.2 1.2v1.6" />
      <path d="M6.6 6.8 7.5 19a1.3 1.3 0 0 0 1.3 1.2h6.4a1.3 1.3 0 0 0 1.3-1.2l.9-12.2" />
      <path d="M10.4 10.4v6M13.6 10.4v6" />
    </>
  ),
};
