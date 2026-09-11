import type { ReactNode } from 'react';

/**
 * The shell every not-yet-built tool is drawn in.
 *
 * These are layout previews, not software. The banner says so at the top of
 * every one, in the tool itself rather than in a tooltip — the artist asked
 * to see the shape of the suite, and the honest way to show it is to show it
 * and label it, not to build something that half works and lets them file a
 * real client under it.
 *
 * The rule for anything inside one of these: no input that looks like it
 * saves, and no figure that looks like it was calculated. Placeholder rows
 * are visibly placeholder.
 */

interface Props {
  name: string;
  /** One line on what the finished tool is for. */
  purpose: string;
  /** What would have to exist before it could be built. */
  needs?: string;
  children: ReactNode;
}

export function MockTool({ name, purpose, needs, children }: Props) {
  return (
    <div className="mock">
      <div className="mock-banner">
        <span className="tag">Preview</span>
        <span>
          <strong>{name} is not built yet.</strong> This is a layout preview — nothing here
          saves, calculates or sends. {purpose}
          {needs ? ` ${needs}` : ''}
        </span>
      </div>
      {children}
    </div>
  );
}

/** A row of placeholder content, visibly not real data. */
export function GhostRows({ count = 5, labels }: { count?: number; labels?: string[] }) {
  const rows = labels ?? Array.from({ length: count }, () => '');
  return (
    <ul className="ghost-rows">
      {rows.map((label, index) => (
        <li key={index}>
          <span className="ghost-dot" aria-hidden="true" />
          {label ? (
            <span className="ghost-label">{label}</span>
          ) : (
            <span className="ghost-bar" style={{ width: `${45 + ((index * 17) % 40)}%` }} aria-hidden="true" />
          )}
          <span className="ghost-bar tail" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}

export function GhostGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="ghost-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="ghost-tile" />
      ))}
    </div>
  );
}
