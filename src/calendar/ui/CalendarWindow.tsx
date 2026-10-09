import { useMemo, useState } from 'react';
import type { CommissionDocument } from '../../commission/types';
import { STAGES, board } from '../../commission/tasks';
import { calculateTotals, formatMoney } from '../../commission/calc';
import { milestoneProgress } from '../../commission/milestones';
import {
  KINDS,
  calendarEvents,
  eventsOn,
  monthGrid,
  monthTitle,
  shiftMonth,
  toIcs,
  type CalendarEvent,
  type CalendarInput,
  type EventKind,
} from '../calendar';

interface Props {
  /** The records, raw: the dates are worked out here, in this lazy chunk. */
  input: CalendarInput;
  onOpen: (open: CalendarEvent['open']) => void;
  onMessage: (text: string) => void;
}

type View = 'month' | 'list' | 'board';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Sat 10 Oct". */
function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/**
 * The calendar: every dated thing in the studio, read off the records. A
 * month to look at, a list to work down, and the commissions as a board by
 * stage. Nothing here is stored; each item opens the record it came from.
 */
export function CalendarWindow({ input, onOpen, onMessage }: Props) {
  const { today, documents } = input;
  const events = useMemo(() => calendarEvents(input), [input]);
  const [view, setView] = useState<View>('month');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string>(today);
  const [hidden, setHidden] = useState<Set<EventKind>>(new Set());
  const shown = useMemo(() => events.filter((e) => !hidden.has(e.kind)), [events, hidden]);
  const counts = useMemo(() => {
    const c: Partial<Record<EventKind, number>> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  const toggle = (kind: EventKind) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const exportIcs = () => {
    const ics = toIcs(shown, new Date());
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studio-calendar.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const n = shown.filter((e) => !e.done).length;
    onMessage(`Saved ${n} ${n === 1 ? 'date' : 'dates'} as a calendar file. Open it on your phone to add them to its calendar — it is a copy, and does not update itself.`);
  };

  return (
    <div className="ca">
      <div className="ca-bar">
        <div className="chip-row" role="tablist" aria-label="Calendar views">
          {(['month', 'list', 'board'] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className="btn" data-variant={view === v ? 'primary' : 'quiet'} onClick={() => setView(v)}>
              {v === 'month' ? 'Month' : v === 'list' ? 'List' : 'Board'}
            </button>
          ))}
        </div>
        {view !== 'board' && (
          <button className="btn" onClick={exportIcs} disabled={!shown.some((e) => !e.done)}>
            Save to phone calendar (.ics)
          </button>
        )}
      </div>

      {view !== 'board' && (
        <div className="chip-row ca-kinds" aria-label="Show these">
          {KINDS.map((k) => (
            <button key={k.id} className="ca-kind" data-kind={k.id} aria-pressed={!hidden.has(k.id)} onClick={() => toggle(k.id)}>
              <span className="ca-dot" data-kind={k.id} aria-hidden="true" />
              {k.label} <span className="faint">{counts[k.id] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {view === 'month' && (
        <>
          <div className="ca-monthbar">
            <button className="btn" data-variant="quiet" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
            <h3>{monthTitle(month)}</h3>
            <button className="btn" data-variant="quiet" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
            <button className="btn" data-variant="quiet" onClick={() => { setMonth(today.slice(0, 7)); setDay(today); }}>Today</button>
          </div>
          <div className="ca-grid" role="group" aria-label={monthTitle(month)}>
            {WEEKDAYS.map((w) => <div key={w} className="ca-head">{w}</div>)}
            {monthGrid(month).map((d) => {
              const on = eventsOn(shown, d);
              return (
                <button
                  key={d}
                  className="ca-day"
                  data-out={d.slice(0, 7) !== month || undefined}
                  data-today={d === today || undefined}
                  aria-pressed={d === day}
                  aria-label={`${dayLabel(d)}: ${on.length ? on.map((e) => e.title).join(', ') : 'nothing'}`}
                  onClick={() => setDay(d)}
                >
                  <span className="ca-num">{Number(d.slice(8))}</span>
                  <span className="ca-chips">
                    {on.slice(0, 3).map((e) => (
                      <span key={e.id} className="ca-chip" data-kind={e.kind} data-done={e.done || undefined} data-overdue={e.overdue || undefined}>
                        {e.title}
                      </span>
                    ))}
                    {on.length > 3 && <span className="ca-more">+{on.length - 3}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <h4 className="ca-dayhead">{dayLabel(day)}</h4>
          <EventList events={eventsOn(shown, day)} onOpen={onOpen} empty="Nothing on this day." />
        </>
      )}

      {view === 'list' && <Agenda events={shown} today={today} onOpen={onOpen} />}

      {view === 'board' && <Board documents={documents} onOpen={onOpen} />}
    </div>
  );
}

function EventList({ events, onOpen, empty }: { events: CalendarEvent[]; onOpen: Props['onOpen']; empty: string }) {
  if (events.length === 0) return <p className="hint">{empty}</p>;
  return (
    <ul className="ca-list">
      {events.map((e) => (
        <li key={e.id}>
          <button className="ca-item" data-done={e.done || undefined} onClick={() => onOpen(e.open)}>
            <span className="ca-dot" data-kind={e.kind} aria-hidden="true" />
            <span className="ca-title">{e.title}</span>
            <span className="faint">
              {e.label}
              {e.end !== e.start ? ` · until ${dayLabel(e.end)}` : ''}
            </span>
            {e.overdue && <span className="ca-late">Overdue</span>}
            {e.done && <span className="faint">Done</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Overdue first, then today onwards by day. Past and done stays in the month view. */
function Agenda({ events, today, onOpen }: { events: CalendarEvent[]; today: string; onOpen: Props['onOpen'] }) {
  const overdue = events.filter((e) => e.overdue);
  const ahead = events.filter((e) => !e.overdue && e.end >= today);
  const days = [...new Set(ahead.map((e) => (e.start < today ? today : e.start)))].sort();
  return (
    <div className="ca-agenda">
      {overdue.length > 0 && (
        <section>
          <h4 className="ca-dayhead ca-late-head">Overdue ({overdue.length})</h4>
          <EventList events={overdue} onOpen={onOpen} empty="" />
        </section>
      )}
      {days.length === 0 && overdue.length === 0 && <p className="hint">Nothing dated from today on.</p>}
      {days.map((d) => (
        <section key={d}>
          <h4 className="ca-dayhead">{d === today ? `Today · ${dayLabel(d)}` : dayLabel(d)}</h4>
          <EventList events={ahead.filter((e) => (e.start < today ? today : e.start) === d)} onOpen={onOpen} empty="" />
        </section>
      ))}
    </div>
  );
}

/** Commissions by stage. The stage is read off each record, so cards move when the records do. */
function Board({ documents, onOpen }: { documents: CommissionDocument[]; onOpen: Props['onOpen'] }) {
  const columns = board(documents);
  const archived = documents.filter((d) => d.state === 'archived').length;
  return (
    <>
      <p className="hint">
        Where each commission stands, read from its state, money and milestones — issue it, record a payment or tick a stage and it moves.
        {archived > 0 && ` ${archived} archived, not shown.`}
      </p>
      <div className="ca-board">
        {columns.map((col) => {
          const meta = STAGES.find((s) => s.id === col.stage)!;
          return (
            <section key={col.stage} className="ca-col" aria-label={meta.label}>
              <h4>
                {meta.label} <span className="faint">{col.docs.length}</span>
              </h4>
              <p className="faint ca-colhint">{meta.hint}</p>
              {col.docs.map((doc) => {
                const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
                const progress = milestoneProgress(doc);
                return (
                  <button key={doc.id} className="ca-card" onClick={() => onOpen({ kind: 'commission', id: doc.id })}>
                    <strong>{doc.title.trim() || doc.documentNumber}</strong>
                    <span className="faint">{doc.client.name.trim() || 'No client named'}</span>
                    <span className="faint">
                      {progress.total > 0 ? `${progress.done}/${progress.total} stages` : 'No stages'}
                      {totals.balance > 0 ? ` · ${formatMoney(totals.balance, doc.quote.currency)} owed` : ''}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
