/**
 * The module registry. A future tool registers its name, icon and entry point
 * here and appears in the dock; nothing else in the shell needs to change.
 *
 * Tools that are not built yet are declared `available: false`. The dock shows
 * them subdued and labelled, and they open nothing — no dead-end screen, and
 * no invented plan or billing behaviour.
 */

import type { ComponentType } from 'react';
import type { IconName } from './icons';

/**
 * Where a module sits in the dock. Working tools lead, previews follow behind
 * a divider, and the Trash is last — five dead buttons at the head of the
 * dock made the row look broken rather than forthcoming.
 */
export type ModuleGroup = 'tool' | 'later' | 'trash';

export interface OsModule {
  id: string;
  name: string;
  /** Which drawn icon to use. See icons.tsx. */
  icon: IconName;
  available: boolean;
  group?: ModuleGroup;
  /** Present only for a module that is actually built. */
  entry?: ComponentType;
}

const modules: OsModule[] = [];

/**
 * Registering a module again replaces it and moves it to the end, so a tool
 * that was a planned placeholder and has since been built takes its place
 * among the working tools rather than keeping the slot it held as a stub.
 */
export function registerModule(module: OsModule): void {
  const existing = modules.findIndex((m) => m.id === module.id);
  if (existing >= 0) modules.splice(existing, 1);
  modules.push(module);
}

const GROUP_ORDER: Record<ModuleGroup, number> = { tool: 0, later: 1, trash: 2 };

/** Registration order within a group is kept; only the groups are ordered. */
export function listModules(): OsModule[] {
  return [...modules].sort(
    (a, b) => GROUP_ORDER[groupOf(a)] - GROUP_ORDER[groupOf(b)],
  );
}

export function groupOf(module: OsModule): ModuleGroup {
  return module.group ?? (module.available ? 'tool' : 'later');
}

export function getModule(id: string): OsModule | undefined {
  return modules.find((m) => m.id === id);
}

/** The tools named in the Phase 1 brief, in dock order. */
export function registerPlannedModules(): void {
  for (const planned of [
    { id: 'shows', name: 'Shows', icon: 'shows' as const },
    { id: 'artwork', name: 'Artwork', icon: 'artwork' as const },
    { id: 'connect', name: 'Connect', icon: 'connect' as const },
    { id: 'visualizer', name: 'Visualizer', icon: 'visualizer' as const },
    { id: 'finance', name: 'Finance', icon: 'finance' as const },
  ]) {
    registerModule({ ...planned, available: false, group: 'later' });
  }
}
