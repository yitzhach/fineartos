import { useMemo, useState } from 'react';
import type { ClientProfile } from '../../clients/clients';
import type { Photo } from '../../photo/photo';
import type { GuestEntry } from '../guestbook';
import {
  EVERYONE,
  MAILTO_LIMIT,
  announcementMailto,
  buildList,
  choices,
  csvName,
  describeSegment,
  listCsv,
  segmentOf,
  type Segment,
} from '../mailing';

interface Props {
  guests: GuestEntry[];
  profiles: ClientProfile[];
  photos: Photo[];
  onMessage: (text: string) => void;
}

/**
 * The mailing list: who said yes, narrowed by show, liked piece or tag, and
 * handed out as a CSV or a mail draft. Nothing is sent from here — the app
 * cannot send mail, and it never says it did.
 */
export function MailingList({ guests, profiles, photos, onMessage }: Props) {
  const list = useMemo(() => buildList(guests, profiles), [guests, profiles]);
  const options = useMemo(() => choices(list), [list]);
  const [segment, setSegment] = useState<Segment>(EVERYONE);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const titleOf = (id: string) => photos.find((p) => p.id === id)?.title || 'a piece no longer here';
  const people = segmentOf(list, segment);
  const asked = guests.filter((g) => g.email).length;
  const mailto = announcementMailto(people, subject, body);

  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(
      () => onMessage(`${what} copied. Paste it into your newsletter tool.`),
      () => onMessage(`${what} could not be copied — this browser did not allow it.`),
    );

  return (
    <div className="ml">
      <p className="hint">
        Only people who said yes: guest-book signers who ticked the box, and clients you marked “may email” in Clients.
        {asked > 0 && ` ${list.length} of the addresses on file are on it.`}
      </p>

      <div className="ml-pickers">
        <label className="field">
          <span>Show</span>
          <select value={segment.show ?? ''} onChange={(e) => setSegment({ ...segment, show: e.target.value || null })}>
            <option value="">Any show</option>
            {options.shows.map((show) => <option key={show} value={show}>{show}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Liked</span>
          <select value={segment.likedPhotoId ?? ''} onChange={(e) => setSegment({ ...segment, likedPhotoId: e.target.value || null })}>
            <option value="">Any piece</option>
            {options.likedPhotoIds.map((id) => <option key={id} value={id}>{titleOf(id)}</option>)}
          </select>
        </label>
        {options.tags.length > 0 && (
          <label className="field">
            <span>Tag</span>
            <select value={segment.tag ?? ''} onChange={(e) => setSegment({ ...segment, tag: e.target.value || null })}>
              <option value="">Any tag</option>
              {options.tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="ml-head">
        <strong aria-live="polite">
          {people.length} {people.length === 1 ? 'person' : 'people'} · {describeSegment(segment, titleOf)}
        </strong>
        <button
          className="btn"
          data-variant="primary"
          disabled={people.length === 0}
          onClick={() => {
            downloadCsv(listCsv(people), csvName(segment, titleOf));
            onMessage(`Saved ${people.length} ${people.length === 1 ? 'address' : 'addresses'} as a CSV for Mailchimp, Kit or Buttondown.`);
          }}
        >
          Export CSV
        </button>
      </div>

      {people.length === 0 ? (
        <p className="hint">
          {list.length === 0 ? 'Nobody on the list yet. When a guest ticks “keep me posted” with an email, they appear here.' : 'Nobody in this segment.'}
        </p>
      ) : (
        <ul className="ml-people">
          {people.map((p) => (
            <li key={p.email}>
              <span>{p.name}</span>
              <span className="faint">{p.email}</span>
            </li>
          ))}
        </ul>
      )}

      {people.length > 0 && (
        <section className="ml-compose">
          <h4>Announce new work</h4>
          <label className="field">
            <span>Subject</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="New paintings this Saturday" />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="chip-row">
            {mailto ? (
              <a className="btn" data-variant="primary" href={mailto} target="_blank" rel="noopener noreferrer">
                Open in my mail app
              </a>
            ) : (
              <span className="hint">
                More than {MAILTO_LIMIT} people is a job for a newsletter tool: export the CSV, then copy the text across.
              </span>
            )}
            <button className="btn" type="button" onClick={() => void copy(people.map((p) => p.email).join(', '), 'Addresses')}>
              Copy addresses
            </button>
            <button className="btn" type="button" disabled={!subject && !body} onClick={() => void copy(`${subject}\n\n${body}`.trim(), 'The announcement')}>
              Copy text
            </button>
          </div>
          <p className="hint">
            {mailto ? 'Opens a draft in your own mail app, everyone in BCC so nobody sees the others. ' : ''}
            Nothing is sent from here.
          </p>
        </section>
      )}
    </div>
  );
}

export function downloadCsv(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked late: Safari has not finished with the URL when the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
