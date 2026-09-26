/**
 * Client follow-ups for Coming up, read straight off the stored profiles so
 * the shell need not build every person from the records to list them.
 * DOM-free.
 */
import type { ClientProfile } from './clients';

export function followUpsDue(
  profiles: Pick<ClientProfile, 'id' | 'followUp' | 'label' | 'name'>[],
  today: string,
  until: string,
): { id: string; date: string; title: string; overdue: boolean }[] {
  const out: { id: string; date: string; title: string; overdue: boolean }[] = [];
  for (const profile of profiles) {
    const date = profile.followUp;
    if (!date || date > until) continue;
    out.push({ id: profile.id, date, title: profile.name || profile.label || 'A client', overdue: date < today });
  }
  return out;
}
