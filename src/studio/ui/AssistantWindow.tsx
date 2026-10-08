import { useEffect, useRef, useState } from 'react';
import { DEVICE_ACTIONS, appMapText, resolveAction, snapshotText, type DeviceOp, type Snapshot } from '../actions';
import { sseReader } from '../sse';
import { readStudioSession, writeStudioSession } from '../session';

interface Props {
  /** What is on the device right now: read fresh for every message and card. */
  snapshot: () => Snapshot;
  /** Carries out one confirmed operation with the app's own functions; returns a plain line. */
  run: (op: DeviceOp) => Promise<string>;
  /** Shows a place from the app map (open_in_app): a dock tool, a folder or a note. */
  openPlace: (place: string, control?: string) => void;
}

type Entry =
  | { kind: 'you'; text: string }
  | { kind: 'reply'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'device'; id: string; name: string; input: Record<string, unknown>; summary: string; state: 'waiting' | 'busy' | 'done' | 'cancelled' | 'failed'; result?: string }
  | { kind: 'studio'; id: string; summary: string; details: { label: string; value: string }[]; state: 'waiting' | 'busy' | 'done' | 'cancelled' | 'failed'; result?: string };

type Account = { state: 'checking' } | { state: 'out' } | { state: 'code'; email: string } | { state: 'in'; email: string } | { state: 'off'; why: string };

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error?.message || `The studio answered ${res.status}.`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  // studio-api wraps every answer in { data } (Art-Talk-Back conventions).
  return data?.data ?? data;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The studio assistant inside Artist OS (Art-Talk-Back D-078, D-079): signing
 * in with the studio's email code, then a chat. Anything that changes the
 * studio comes back as a card; nothing is done until Confirm. Text from the
 * model is drawn as text, never as markup.
 */
export function AssistantWindow({ snapshot, run, openPlace }: Props) {
  const hint = readStudioSession();
  const [account, setAccount] = useState<Account>(hint ? { state: 'in', email: hint.email } : { state: 'checking' });
  const [log, setLog] = useState<Entry[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [replies, setReplies] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const outcomes = useRef<string[]>([]);
  const fresh = useRef(true);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [log]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const status = await fetch('/assistant/status', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!status?.available) {
          if (live) setAccount({ state: 'off', why: navigator.onLine ? 'The assistant isn’t switched on for this copy of Artist OS yet.' : 'You’re offline. The assistant needs a connection; everything else works as usual.' });
          return;
        }
        const me = await call('GET', '/v1/me');
        writeStudioSession({ email: me?.user?.email ?? '' });
        if (live) setAccount({ state: 'in', email: me?.user?.email ?? '' });
      } catch (cause) {
        const status = (cause as { status?: number }).status;
        if (status === 401) writeStudioSession(null);
        if (live) setAccount(status === 401 ? { state: 'out' } : { state: 'off', why: (cause as Error).message });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const patch = (id: string, change: Partial<Entry>) =>
    setLog((all) => all.map((e) => ('id' in e && e.id === id ? ({ ...e, ...change } as Entry) : e)));

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setReplies([]);
    setDraft('');
    setLog((all) => [...all, { kind: 'you', text: message }, { kind: 'reply', text: '' }]);
    const appendReply = (piece: string) =>
      setLog((all) => {
        const last = all[all.length - 1];
        return last?.kind === 'reply' ? [...all.slice(0, -1), { ...last, text: last.text + piece }] : [...all, { kind: 'reply', text: piece }];
      });
    const snap = snapshot();
    const body: Record<string, unknown> = {
      app: 'fineartos',
      message,
      today: today(),
      page: snap.open[0] ?? 'Home',
      appMap: appMapText(snap),
      appData: snapshotText(snap),
      commands: ['open'],
      deviceActions: DEVICE_ACTIONS,
      ...(outcomes.current.length ? { deviceOutcomes: outcomes.current } : {}),
      ...(fresh.current ? { fresh: true } : {}),
    };
    outcomes.current = [];
    fresh.current = false;
    try {
      const res = await fetch('/assistant/chat', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        if (res.status === 401) {
          writeStudioSession(null);
          setAccount({ state: 'out' });
          throw new Error('Your studio sign-in has ended. Sign in again to keep chatting.');
        }
        throw new Error(data?.error?.message || 'The assistant could not answer.');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const read = sseReader();
      for (;;) {
        const chunk = await reader.read();
        for (const raw of read(decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done }) + (chunk.done ? '\n\n' : ''))) {
          const ev = raw as Record<string, any>;
          if (ev.type === 'text') appendReply(String(ev.text));
          else if (ev.type === 'replies') setReplies((ev.items as string[]).slice(0, 4));
          else if (ev.type === 'open') openPlace(String(ev.place), ev.control ? String(ev.control) : undefined);
          else if (ev.type === 'device') setLog((all) => [...all, { kind: 'device', id: String(ev.id), name: String(ev.name), input: ev.input ?? {}, summary: String(ev.summary), state: 'waiting' }]);
          else if (ev.type === 'card') {
            const p = ev.proposal ?? {};
            setLog((all) => [...all, { kind: 'studio', id: String(p.id), summary: String(p.summary ?? ''), details: Array.isArray(p.details) ? p.details : [], state: 'waiting' }]);
          } else if (ev.type === 'end' && ev.reason !== 'end_turn') {
            setError(ev.reason === 'error' ? 'The assistant stopped partway. Nothing was changed by that message.' : ev.reason === 'step_limit' ? 'That took too many steps; ask for one thing at a time.' : 'The assistant could not finish that answer.');
          }
        }
        if (chunk.done) break;
      }
    } catch (cause) {
      setError(navigator.onLine ? (cause as Error).message : 'The connection dropped. Nothing was changed by that message.');
    } finally {
      // An empty reply bubble (a turn that only left a card) is dropped.
      setLog((all) => all.filter((e) => !(e.kind === 'reply' && !e.text)));
      setBusy(false);
    }
  };

  const confirmDevice = async (entry: Extract<Entry, { kind: 'device' }>) => {
    patch(entry.id, { state: 'busy' });
    const resolved = resolveAction(entry.name, entry.input, snapshot());
    if (!resolved.ok) {
      patch(entry.id, { state: 'failed', result: resolved.message });
      outcomes.current.push(`card ${entry.id} "${entry.summary.slice(0, 100)}": could not be done — ${resolved.message}`);
      return;
    }
    try {
      const done = await run(resolved.op);
      patch(entry.id, { state: 'done', result: done });
      outcomes.current.push(`card ${entry.id} "${entry.summary.slice(0, 100)}": confirmed by the artist and done on the device — ${done}`);
    } catch (cause) {
      const why = `It could not be saved: ${String((cause as Error).message ?? cause)}`;
      patch(entry.id, { state: 'failed', result: why });
      outcomes.current.push(`card ${entry.id} "${entry.summary.slice(0, 100)}": failed, nothing saved`);
    }
  };

  const cancelDevice = (entry: Extract<Entry, { kind: 'device' }>) => {
    patch(entry.id, { state: 'cancelled', result: 'Cancelled. Nothing was changed.' });
    outcomes.current.push(`card ${entry.id} "${entry.summary.slice(0, 100)}": cancelled, nothing done`);
  };

  const answerStudio = async (entry: Extract<Entry, { kind: 'studio' }>, verb: 'confirm' | 'cancel') => {
    patch(entry.id, { state: 'busy' });
    try {
      await call('POST', `/v1/assistant/proposals/${encodeURIComponent(entry.id)}/${verb}`);
      patch(entry.id, verb === 'confirm' ? { state: 'done', result: 'Saved in the studio.' } : { state: 'cancelled', result: 'Cancelled. Nothing was saved.' });
    } catch (cause) {
      patch(entry.id, { state: 'waiting', result: (cause as Error).message });
    }
  };

  if (account.state === 'checking') return <p className="hint as-pad">Checking the studio…</p>;
  if (account.state === 'off') return <p className="hint as-pad" role="status">{account.why}</p>;
  if (account.state === 'out' || account.state === 'code') return <SignIn account={account} onAccount={setAccount} />;

  return (
    <div className="as-window">
      <div className="as-log" aria-live="polite">
        {log.length === 0 && (
          <p className="hint">
            Ask in words: “make a note called Framing quote in the Harbour folder”, “what’s in Harbour?”, “open the books”.
            Anything that changes your studio shows a card first; nothing happens until you tap Confirm.
          </p>
        )}
        {log.map((entry, i) =>
          entry.kind === 'you' ? (
            <p key={i} className="as-you">{entry.text}</p>
          ) : entry.kind === 'reply' ? (
            <p key={i} className="as-reply">{entry.text}</p>
          ) : entry.kind === 'note' ? (
            <p key={i} className="hint">{entry.text}</p>
          ) : (
            <div key={entry.id} className="as-card" data-state={entry.state}>
              <h4>Confirm to save</h4>
              <p>{entry.summary}</p>
              {entry.kind === 'studio' && entry.details.length > 0 && (
                <dl>
                  {entry.details.map((d) => (
                    <div key={d.label}>
                      <dt>{d.label}</dt>
                      <dd>{d.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {entry.state === 'waiting' && (
                <div className="chip-row">
                  <button className="btn" data-variant="primary" onClick={() => (entry.kind === 'device' ? void confirmDevice(entry) : void answerStudio(entry, 'confirm'))}>
                    Confirm
                  </button>
                  <button className="btn" onClick={() => (entry.kind === 'device' ? cancelDevice(entry) : void answerStudio(entry, 'cancel'))}>
                    Cancel
                  </button>
                </div>
              )}
              {entry.state === 'busy' && <p className="hint">Saving…</p>}
              {entry.result && <p className="hint" role="status">{entry.result}</p>}
            </div>
          ),
        )}
        {error && <p className="as-error" role="alert">{error}</p>}
        <div ref={end} />
      </div>
      {replies.length > 0 && (
        <div className="chip-row">
          {replies.map((r) => (
            <button key={r} className="btn" onClick={() => void send(r)}>{r}</button>
          ))}
        </div>
      )}
      <form
        className="as-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          aria-label="Ask the assistant"
          placeholder="Ask the assistant…"
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <button className="btn" data-variant="primary" type="submit" disabled={busy || !draft.trim()}>
          {busy ? 'Thinking…' : 'Send'}
        </button>
      </form>
      <p className="faint as-foot">
        Signed in as {account.email || 'you'} ·{' '}
        <button
          className="linkish"
          onClick={async () => {
            await call('POST', '/v1/auth/logout').catch(() => undefined);
            writeStudioSession(null);
            setAccount({ state: 'out' });
          }}
        >
          Sign out
        </button>
      </p>
    </div>
  );
}

function SignIn({ account, onAccount }: { account: Extract<Account, { state: 'out' | 'code' }>; onAccount: (a: Account) => void }) {
  const [email, setEmail] = useState(account.state === 'code' ? account.email : '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (step: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (cause) {
      setError(navigator.onLine ? (cause as Error).message : 'You’re offline. Signing in needs a connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="as-pad as-signin"
      onSubmit={(e) => {
        e.preventDefault();
        if (account.state === 'out') {
          void go(async () => {
            await call('POST', '/v1/auth/code', { email: email.trim().toLowerCase() });
            onAccount({ state: 'code', email: email.trim().toLowerCase() });
          });
        } else {
          void go(async () => {
            const me = await call('POST', '/v1/auth/verify', { email: account.email, code: code.trim() });
            const who = me?.user?.email ?? account.email;
            writeStudioSession({ email: who });
            onAccount({ state: 'in', email: who });
          });
        }
      }}
    >
      <h3>Sign in to your studio</h3>
      <p className="hint">
        The assistant needs your studio account. You stay signed in on this device while you use it at least once a month.
        Signed out, Artist OS works exactly as before, offline.
      </p>
      {account.state === 'out' ? (
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      ) : (
        <label className="field">
          <span>The 6-digit code emailed to {account.email}</span>
          <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
      )}
      {error && <p className="as-error" role="alert">{error}</p>}
      <div className="chip-row">
        <button className="btn" data-variant="primary" type="submit" disabled={busy}>
          {busy ? 'One moment…' : account.state === 'out' ? 'Email me a code' : 'Sign in'}
        </button>
        {account.state === 'code' && (
          <button type="button" className="btn" data-variant="quiet" onClick={() => onAccount({ state: 'out' })}>
            Use another email
          </button>
        )}
      </div>
    </form>
  );
}
