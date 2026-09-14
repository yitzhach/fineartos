import { useEffect, useRef, useState } from 'react';

/**
 * Speaking into a field instead of typing it.
 *
 * Standing in a car park with a fuel receipt in one hand is the moment this
 * is for. Where the browser can listen, a small microphone appears beside the
 * field and what is said is appended to whatever is already there. Where it
 * cannot — and that includes plenty of desktop browsers — there is no button
 * at all, because a dead microphone is worse than none: every phone keyboard
 * already has one that works.
 */

interface SpeechResultEvent extends Event {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recogniser extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type RecogniserClass = new () => Recogniser;

function recogniserClass(): RecogniserClass | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecogniserClass;
    webkitSpeechRecognition?: RecogniserClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean {
  return recogniserClass() !== null;
}

export function Dictate({
  label,
  onText,
}: {
  /** What is being filled in, for the button's own label. */
  label: string;
  onText: (text: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const recogniser = useRef<Recogniser | null>(null);

  useEffect(() => () => recogniser.current?.stop(), []);

  if (!dictationSupported()) return null;

  const start = () => {
    const Recogniser = recogniserClass();
    if (!Recogniser) return;
    const listener = new Recogniser();
    recogniser.current = listener;
    listener.lang = navigator.language || 'en-US';
    listener.interimResults = false;
    listener.continuous = false;
    listener.onresult = (event) => {
      const said = Array.from({ length: event.results.length }, (_, index) =>
        String(event.results[index]?.[0]?.transcript ?? ''),
      )
        .join(' ')
        .trim();
      if (said) onText(said);
    };
    listener.onerror = () => setListening(false);
    listener.onend = () => setListening(false);
    listener.start();
    setListening(true);
  };

  return (
    <button
      type="button"
      className="dictate"
      data-on={listening}
      aria-label={listening ? `Listening for ${label}` : `Speak ${label}`}
      title={listening ? 'Listening — say it now' : `Speak ${label}`}
      onClick={() => (listening ? recogniser.current?.stop() : start())}
    >
      <span aria-hidden="true">{listening ? '●' : '🎙'}</span>
    </button>
  );
}
