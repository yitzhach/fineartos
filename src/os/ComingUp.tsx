import type { ComingItem } from './dashboard';

/** "Oct 3". The year is left off: everything here is within a month or so. */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/**
 * The desktop's one panel: what is dated in the next month, read off shows
 * and money owed. Home shows it, because Home shows the desktop.
 */
export function ComingUp({ items, onOpen }: { items: ComingItem[]; onOpen: (item: ComingItem) => void }) {
  return (
    <section className="coming-up no-print" aria-label="Coming up" onClick={(e) => e.stopPropagation()}>
      <h3>Coming up</h3>
      {items.length === 0 ? (
        <p className="hint">Nothing dated in the next 30 days. Show deadlines and payment due dates land here.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button onClick={() => onOpen(item)} data-overdue={item.overdue}>
                <span className="cu-date">{shortDate(item.date)}</span>
                <span className="cu-what">
                  <strong>{item.title}</strong>
                  <span className="cu-label">{item.label}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
