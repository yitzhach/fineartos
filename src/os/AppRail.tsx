import type { WindowKind } from './windows';

export interface RailItem {
  id: string;
  name: string;
  icon: string;
  kind: WindowKind;
  built: boolean;
}

/**
 * The navigation rail down the left of a project window, as in the reference.
 *
 * It opens other windows rather than swapping this one's contents, which is
 * the point of having a window manager at all: Clients and Calendar can sit
 * open beside the project you are working on.
 *
 * Previews are marked here rather than hidden. Seeing the shape of the finished
 * suite is the reason they exist; labelling them is what keeps that honest.
 */
export const RAIL_ITEMS: RailItem[] = [
  { id: 'projects', name: 'Projects', icon: '▤', kind: { type: 'list' }, built: true },
  {
    id: 'invoices',
    name: 'Invoices',
    icon: '❑',
    kind: { type: 'tool', tool: 'invoices-list' },
    built: true,
  },
  { id: 'clients', name: 'Clients', icon: '◉', kind: { type: 'tool', tool: 'clients' }, built: false },
  { id: 'calendar', name: 'Calendar', icon: '▦', kind: { type: 'tool', tool: 'calendar' }, built: false },
  { id: 'files', name: 'Files', icon: '◧', kind: { type: 'tool', tool: 'files' }, built: false },
  {
    id: 'templates',
    name: 'Templates',
    icon: '◫',
    kind: { type: 'tool', tool: 'templates' },
    built: false,
  },
  { id: 'settings', name: 'Settings', icon: '⚙', kind: { type: 'settings' }, built: true },
];

interface Props {
  activeId: string;
  onOpen: (item: RailItem) => void;
}

export function AppRail({ activeId, onOpen }: Props) {
  return (
    <nav className="rail" aria-label="Tools">
      <div className="rail-items">
        {RAIL_ITEMS.map((item) => (
          <button
            key={item.id}
            className="rail-item"
            aria-current={activeId === item.id}
            onClick={() => onOpen(item)}
            title={item.built ? item.name : `${item.name} — preview only`}
          >
            <span className="rail-icon" aria-hidden="true">{item.icon}</span>
            <span className="rail-name">{item.name}</span>
            {!item.built && <span className="rail-tag">Preview</span>}
          </button>
        ))}
      </div>

      <div className="rail-foot">
        <span className="rail-word">Artist OS</span>
        <span className="rail-tagline">Create · Organise · Thrive</span>
      </div>
    </nav>
  );
}
