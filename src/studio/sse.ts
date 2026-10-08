/**
 * Server-sent events from /assistant/chat, split as they arrive. Feed it each
 * decoded chunk; it returns the whole events in it and keeps a partial one
 * for the next chunk. DOM-free.
 */
export function sseReader(): (chunk: string) => unknown[] {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    const events: unknown[] = [];
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // A broken event is skipped; the turn's end event still arrives.
      }
    }
    return events;
  };
}
