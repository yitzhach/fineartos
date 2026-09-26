import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../commission/calc';
import {
  editProfile,
  personFor,
  parseTags,
  profileFor,
  searchPeople,
  type ClientProfile,
  type ClientSource,
  type Person,
} from '../clients';

interface Props {
  people: Person[];
  /** Pairs that might be one person — offered, never merged silently. */
  pairs: [Person, Person][];
  onSaveProfile: (profile: ClientProfile) => void;
  onMerge: (a: Person, b: Person) => void;
  onDifferent: (a: Person, b: Person) => void;
  onImport: (file: File) => void;
  onOpenSource: (source: ClientSource) => void;
  /** Opens Notes with a new note pinned to this person. */
  onNote: (person: Person) => void;
  /** How many notes are pinned to each person id. */
  noteCounts: Record<string, number>;
  focus?: { id: string } | null;
}

const KIND_LABEL = { commission: 'Commission', invoice: 'Invoice', guest: 'Guest book', contact: 'Contact' } as const;

/**
 * Clients: one row per person, built from every record that names them. What
 * the artist writes here (tags, a follow-up, a note) is kept on a profile;
 * everything else is read from the records, so it cannot drift.
 */
export function ClientsWindow(props: Props) {
  const { people, pairs, focus } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (focus) setSelectedId(focus.id);
  }, [focus]);
  const shown = searchPeople(people, query);
  const selected = selectedId ? personFor(people, selectedId) : null;

  return (
    <div className="sh-window cl-window">
      <div className="sh-bar">
        <input
          aria-label="Find a client"
          type="search"
          placeholder="Find by name, email, phone or tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chip-row">
          <button className="btn" data-variant="quiet" onClick={() => fileRef.current?.click()}>
            Import contacts (vCard or CSV)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".vcf,.csv,text/vcard,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) props.onImport(file);
              e.target.value = '';
            }}
          />
        </div>
        <p className="hint">
          {people.length === 1 ? '1 person' : `${people.length} people`}, from commissions, invoices, the guest book
          and imported contacts. Records join on their own only by the same email or phone.
        </p>
      </div>

      {pairs.length > 0 && (
        <section className="cl-pairs" aria-label="Maybe the same person">
          <h3>Maybe the same person</h3>
          {pairs.slice(0, 5).map(([a, b]) => (
            <div className="cl-pair" key={`${a.id}|${b.id}`}>
              <span>
                <strong>{a.name}</strong> ({a.emails[0] ?? a.phones[0] ?? 'no email or phone'}) and{' '}
                <strong>{b.name}</strong> ({b.emails[0] ?? b.phones[0] ?? 'no email or phone'})
              </span>
              <button className="btn" onClick={() => props.onMerge(a, b)}>
                Same person
              </button>
              <button className="btn" data-variant="quiet" onClick={() => props.onDifferent(a, b)}>
                Different people
              </button>
            </div>
          ))}
          {pairs.length > 5 && <p className="hint">And {pairs.length - 5} more after these.</p>}
        </section>
      )}

      <div className="sh-body">
        <ul className="sh-list">
          {people.length === 0 && (
            <li className="hint">Nobody yet. A client on a commission or an invoice, or a guest who signs, appears here.</li>
          )}
          {people.length > 0 && shown.length === 0 && <li className="hint">No match.</li>}
          {shown.map((person) => (
            <li key={person.id}>
              <button aria-current={person.id === selected?.id} onClick={() => setSelectedId(person.id)}>
                <strong>{person.name}</strong>
                <span className="faint">
                  {[person.emails[0], person.phones[0]].filter(Boolean).join(' · ') || 'No email or phone'}
                </span>
                <span className="faint">
                  {person.profile?.tags.join(', ') || `${person.sources.length} record${person.sources.length === 1 ? '' : 's'}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <PersonDetail key={selected.id} person={selected} {...props} />
        ) : (
          <p className="hint sh-empty">Pick someone to see everything they are in.</p>
        )}
      </div>
    </div>
  );
}

function PersonDetail({ person, onSaveProfile, onOpenSource, onNote, noteCounts }: Props & { person: Person }) {
  const profile = person.profile;
  const [tags, setTags] = useState(profile?.tags.join(', ') ?? '');
  const [note, setNote] = useState(profile?.note ?? '');
  const save = (changes: Partial<ClientProfile>) => onSaveProfile(editProfile(profileFor(person), changes));
  const spent = Object.entries(person.spend);
  const notes = noteCounts[person.id] ?? 0;

  return (
    <div className="sh-detail cl-detail">
      <h2>{person.name}</h2>
      <p className="hint">
        {[...person.emails, ...person.phones].join(' · ') || 'No email or phone on any record.'}
      </p>
      <dl className="cl-facts">
        <dt>Last contact</dt>
        <dd>{person.lastContact ?? 'Not recorded'}</dd>
        <dt>Received</dt>
        <dd>
          {spent.length === 0 ? 'Nothing recorded' : spent.map(([currency, minor]) => formatMoney(minor, currency)).join(' + ')}
          {person.notCounted > 0 &&
            ` · ${person.notCounted} ${person.notCounted === 1 ? 'record has' : 'records have'} no price set, left out`}
        </dd>
      </dl>

      <label className="field">
        <span>Follow up on</span>
        <input
          type="date"
          value={profile?.followUp ?? ''}
          onChange={(e) => save({ followUp: e.target.value || null })}
        />
      </label>
      <label className="field">
        <span>Tags, separated by commas</span>
        <input
          type="text"
          value={tags}
          placeholder="collector, gallery, press"
          onChange={(e) => setTags(e.target.value)}
          onBlur={() => save({ tags: parseTags(tags) })}
        />
      </label>
      <label className="field">
        <span>Note</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => save({ note: note.trim() || null })} />
      </label>
      <div className="chip-row">
        <button className="btn" onClick={() => onNote(person)}>
          {notes > 0 ? `Notes (${notes})` : 'Add a note'}
        </button>
      </div>

      <h3>Everything they are in</h3>
      <ul className="cl-sources">
        {person.sources.map((source) => (
          <li key={`${source.kind}:${source.id}`}>
            <button className="linkish" onClick={() => onOpenSource(source)}>
              <span className="faint">{KIND_LABEL[source.kind]}</span> {source.label}
              {source.date ? <span className="faint"> · {source.date}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
