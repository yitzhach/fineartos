import type { CommissionDocument } from '../commission/types';
import type { Invoice } from '../invoice/types';
import type { Project } from '../project/project';
import { projectItemCount } from '../project/project';

export type DesktopItem =
  | { kind: 'project'; id: string; project: Project }
  | { kind: 'document'; id: string; document: CommissionDocument }
  | { kind: 'invoice'; id: string; invoice: Invoice };

interface Props {
  items: DesktopItem[];
  /** Object URLs by image id, for thumbnails. A missing id draws no frame. */
  imageUrls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (item: DesktopItem) => void;
  onNew: () => void;
}

/**
 * The desktop. One click selects, two clicks open — the thing every desktop
 * has done for forty years, and what the artist asked for. Enter and Space
 * open the selected icon too, so this is not a mouse-only surface.
 */
export function Desktop({ items, imageUrls, selectedId, onSelect, onOpen, onNew }: Props) {
  return (
    <div
      className="desktop-surface"
      // Clicking the empty desktop clears the selection, as it should.
      onClick={() => onSelect(null)}
    >
      <div className="desktop-icons">
        {items.map((item) => (
          <Icon
            key={item.id}
            item={item}
            imageUrls={imageUrls}
            selected={selectedId === item.id}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ))}

        <button
          className="desktop-icon new"
          onClick={(e) => {
            e.stopPropagation();
            onNew();
          }}
        >
          <span className="thumb blank" aria-hidden="true">
            <span className="plus">+</span>
          </span>
          <span className="label">New commission</span>
        </button>
      </div>
    </div>
  );
}

function Icon({
  item,
  imageUrls,
  selected,
  onSelect,
  onOpen,
}: {
  item: DesktopItem;
  imageUrls: Record<string, string>;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (item: DesktopItem) => void;
}) {
  const { name, caption, thumbId, badge } = describe(item);
  const url = thumbId ? imageUrls[thumbId] : undefined;

  return (
    <button
      className="desktop-icon"
      data-kind={item.kind}
      data-selected={selected}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
      title={`${name} — double-click to open`}
    >
      <span className={`thumb ${item.kind}`} aria-hidden="true">
        {url ? (
          <img src={url} alt="" />
        ) : item.kind === 'project' ? (
          <span className="folder-face" />
        ) : (
          <span className="sheet-face" />
        )}
        {badge && <span className="kind-badge">{badge}</span>}
      </span>
      <span className="label">{name}</span>
      {caption && <span className="caption">{caption}</span>}
    </button>
  );
}

function describe(item: DesktopItem): {
  name: string;
  caption: string | null;
  thumbId: string | null;
  badge: string | null;
} {
  if (item.kind === 'project') {
    const count = projectItemCount(item.project);
    return {
      name: item.project.name,
      caption: count === 1 ? '1 item' : `${count} items`,
      thumbId: item.project.coverImageId,
      badge: null,
    };
  }

  if (item.kind === 'invoice') {
    return {
      name: item.invoice.invoiceNumber,
      caption: item.invoice.client.name.trim() || 'No client set',
      thumbId: null,
      badge: 'INV',
    };
  }

  const doc = item.document;
  return {
    name: doc.title.trim() || doc.documentNumber,
    caption: doc.client.name.trim() || 'No client set',
    // The first reference image is the project's face. Nothing is invented
    // when there is no image: the icon draws a plain sheet instead.
    thumbId: doc.artwork.referenceImageIds[0] ?? null,
    badge: doc.isDemo ? 'DEMO' : null,
  };
}
