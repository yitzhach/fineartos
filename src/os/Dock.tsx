import { listModules } from './registry';

interface Props {
  activeId: string;
  onOpen: (id: string) => void;
}

/**
 * Home and Commissions work. Everything else is registered as unavailable and
 * rendered subdued and labelled — it opens nothing, so there is no dead end.
 */
export function Dock({ activeId, onOpen }: Props) {
  return (
    <nav className="dock" aria-label="Applications">
      {listModules().map((module) => (
        <button
          key={module.id}
          className="dock-item"
          aria-current={activeId === module.id}
          disabled={!module.available}
          onClick={() => module.available && onOpen(module.id)}
          title={module.available ? module.name : `${module.name} — coming later`}
        >
          <span className="glyph" aria-hidden="true">{module.icon}</span>
          <span className="name">{module.name}</span>
          {!module.available && <span className="later">Coming later</span>}
        </button>
      ))}
    </nav>
  );
}
