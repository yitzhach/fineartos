/**
 * The module registry. A future tool registers its name, icon and entry point
 * here and appears in the dock; nothing else in the shell needs to change.
 *
 * Tools that are not built yet are declared `available: false`. The dock shows
 * them subdued and labelled, and they open nothing — no dead-end screen, and
 * no invented plan or billing behaviour.
 */

import type { ComponentType } from 'react';

export interface OsModule {
  id: string;
  name: string;
  icon: string;
  available: boolean;
  /** Present only for a module that is actually built. */
  entry?: ComponentType;
}

const modules: OsModule[] = [];

export function registerModule(module: OsModule): void {
  const existing = modules.findIndex((m) => m.id === module.id);
  if (existing >= 0) modules[existing] = module;
  else modules.push(module);
}

export function listModules(): OsModule[] {
  return [...modules];
}

export function getModule(id: string): OsModule | undefined {
  return modules.find((m) => m.id === id);
}

/** The tools named in the Phase 1 brief, in dock order. */
export function registerPlannedModules(): void {
  for (const planned of [
    { id: 'shows', name: 'Shows', icon: '◇' },
    { id: 'artwork', name: 'Artwork', icon: '▤' },
    { id: 'connect', name: 'Connect', icon: '◉' },
    { id: 'visualizer', name: 'Visualizer', icon: '◱' },
    { id: 'finance', name: 'Finance', icon: '≡' },
  ]) {
    registerModule({ ...planned, available: false });
  }
}
