/**
 * G, then a letter, opens a tool. Kept apart from launcher.ts so the keys
 * work from the first frame while the search box's tables load later.
 * DOM-free and tested (launcher.test.ts).
 */

/**
 * Two-key shortcuts for the tools: G, then the letter. The letter is the
 * tool's initial wherever that is free; Finance is B for the books, because
 * F was already the Finder.
 */
export const GO_KEYS: Record<string, string> = {
  p: 'commissions',
  i: 'invoices',
  f: 'finder',
  c: 'connect',
  a: 'artwork',
  s: 'shows',
  b: 'finance',
  l: 'clients',
  n: 'notes',
  v: 'visualizer',
  k: 'calendar',
  t: 'trash',
  h: 'home',
};

/** How long after G the second key still counts. */
export const GO_WINDOW_MS = 1500;

export interface GoState {
  /** When G was pressed, or null when not waiting for a second key. */
  armedAt: number | null;
}

/**
 * One key press through the G-sequence. The caller passes only plain keys —
 * none with Ctrl, ⌘ or Alt held — and only when nobody is typing in a field.
 * `consumed` says the key was part of a sequence and should do nothing else.
 */
export function goStep(
  state: GoState,
  key: string,
  now: number,
): { state: GoState; tool: string | null; consumed: boolean } {
  const k = key.toLowerCase();
  const armed = state.armedAt !== null && now - state.armedAt <= GO_WINDOW_MS;
  if (armed) {
    const tool = GO_KEYS[k] ?? null;
    if (tool) return { state: { armedAt: null }, tool, consumed: true };
    if (k === 'g') return { state: { armedAt: now }, tool: null, consumed: true };
    return { state: { armedAt: null }, tool: null, consumed: false };
  }
  if (k === 'g') return { state: { armedAt: now }, tool: null, consumed: true };
  return { state: { armedAt: null }, tool: null, consumed: false };
}
