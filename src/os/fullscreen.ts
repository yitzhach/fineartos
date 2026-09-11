import { useCallback, useEffect, useState } from 'react';

/**
 * Fullscreen, with the browser differences handled in one place.
 *
 * Worth knowing: iPhone Safari does not implement the element fullscreen API
 * at all. Rather than showing a button that does nothing there, the hook
 * reports that it is unsupported and the system bar leaves the control out.
 * A dead button is worse than no button.
 *
 * The state is read from the document rather than remembered, because the
 * browser can leave fullscreen without asking us — Escape, the window
 * manager, switching tabs on some systems. `fullscreenchange` is the only
 * honest source of truth.
 */

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const element = document.documentElement as WebkitElement;
  return Boolean(
    document.fullscreenEnabled ||
      element.requestFullscreen ||
      element.webkitRequestFullscreen,
  );
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export async function enterFullscreen(): Promise<void> {
  const element = document.documentElement as WebkitElement;
  if (element.requestFullscreen) await element.requestFullscreen();
  else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as WebkitDocument;
  if (doc.exitFullscreen) await doc.exitFullscreen();
  else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
}

export interface FullscreenControl {
  supported: boolean;
  active: boolean;
  /** Resolves once the browser has acted, or reports why it refused. */
  toggle: () => Promise<void>;
  error: string | null;
}

export function useFullscreen(): FullscreenControl {
  const [supported] = useState(fullscreenSupported);
  const [active, setActive] = useState(isFullscreen);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Both event names: the unprefixed one, and webkit's for older Safari.
    const sync = () => setActive(isFullscreen());
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggle = useCallback(async () => {
    setError(null);
    try {
      if (isFullscreen()) await exitFullscreen();
      else await enterFullscreen();
    } catch (cause) {
      // A browser can refuse — a permissions policy in an iframe, or a call
      // the browser did not consider user-initiated. Say so rather than
      // leaving a button that silently does nothing.
      setError(
        cause instanceof Error && cause.message
          ? `Fullscreen was refused: ${cause.message}`
          : 'This browser refused to go fullscreen.',
      );
    }
  }, []);

  return { supported, active, toggle, error };
}
