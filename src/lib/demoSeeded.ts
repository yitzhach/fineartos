/** Whether the first-run demo was seeded — kept apart so the demo itself loads only on a first run. */

const SEEDED_KEY = 'artistOS.demoSeeded';

export function demoAlreadySeeded(): boolean {
  try {
    return localStorage.getItem(SEEDED_KEY) === 'true';
  } catch {
    // With site data blocked we cannot remember, so we do not seed at all
    // rather than re-seed a demo on every single load.
    return true;
  }
}

export function markDemoSeeded(): void {
  try {
    localStorage.setItem(SEEDED_KEY, 'true');
  } catch {
    /* preferences are a convenience, not a requirement */
  }
}
