/**
 * Object URLs for a set of stored images. One map per set for the whole app:
 * two windows onto the same project would otherwise each make a URL for the
 * same blob, and one closing would revoke the other's.
 *
 * The map is patched per image, never rebuilt: adding one photograph to two
 * hundred reads one record, not two hundred. With `thumbs`, each URL points
 * at the small copy beside the original. An image without one gets it made
 * in the background, two at a time, and shows once it exists: drawing two
 * hundred full photographs on the desktop at once is exactly the stall this
 * is here to avoid. One the browser cannot shrink shows the original.
 */
import { useEffect, useRef, useState } from 'react';
import type { Repository } from '../persistence/repository';
import { diffIdsKey } from '../persistence/records';
import { makeThumbnail } from '../photo/thumbnail';

/** `key` is the image ids, sorted and joined with commas. */
export function useObjectUrls(repo: Repository, key: string, thumbs = false): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const live = useRef(new Map<string, string>());
  const loadedKey = useRef('');
  const backlog = useRef<string[]>([]);
  const working = useRef(false);
  const pending = useRef(0);

  useEffect(() => {
    const { added, removed } = diffIdsKey(loadedKey.current, key);
    loadedKey.current = key;

    const stale: string[] = [];
    for (const id of removed) {
      const url = live.current.get(id);
      if (url) stale.push(url);
      live.current.delete(id);
    }
    // Revoked a beat later: React can still paint one frame with the old
    // src, and a revoked blob URL in an <img> is a console error.
    if (stale.length > 0) setTimeout(() => stale.forEach((url) => URL.revokeObjectURL(url)), 1000);

    const publishNow = () => setUrls(Object.fromEntries(live.current));
    // Batched: every setUrls redraws the shell, and a backfill makes hundreds.
    const publish = () => {
      if (pending.current) return;
      pending.current = window.setTimeout(() => {
        pending.current = 0;
        publishNow();
      }, 400);
    };

    const swap = (id: string, blob: Blob) => {
      const old = live.current.get(id);
      live.current.set(id, URL.createObjectURL(blob));
      if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
    };

    const worker = async () => {
      for (let id = backlog.current.shift(); id; id = backlog.current.shift()) {
        const image = await repo.getImage(id);
        if (!image || image.thumb !== undefined) continue;
        const thumb = await makeThumbnail(image.blob);
        try {
          await repo.setThumbnail(id, thumb);
        } catch {
          // The small copy is a convenience; it is made again next load.
        }
        if (!loadedKey.current.split(',').includes(id)) continue;
        swap(id, thumb ?? image.blob);
        publish();
      }
    };
    const backfill = async () => {
      if (working.current) return;
      working.current = true;
      try {
        await Promise.all([worker(), worker()]);
      } finally {
        working.current = false;
      }
    };

    void (async () => {
      for (const id of added) {
        const image = await repo.getImage(id);
        // Left the set while this was reading: nothing to show it in.
        if (!image || !loadedKey.current.split(',').includes(id)) continue;
        if (thumbs && image.thumb === undefined) {
          backlog.current.push(id);
          continue;
        }
        const blob = thumbs && image.thumb ? image.thumb : image.blob;
        live.current.set(id, URL.createObjectURL(blob));
      }
      publishNow();
      if (thumbs && backlog.current.length > 0) void backfill();
    })();
    if (removed.length > 0) publishNow();
  }, [key, repo, thumbs]);

  // Everything goes when the map itself does.
  useEffect(() => {
    const map = live.current;
    return () => {
      const all = [...map.values()];
      // Cleared too, so a remount (React's strict mode does one) starts over.
      map.clear();
      window.clearTimeout(pending.current);
      pending.current = 0;
      loadedKey.current = '';
      backlog.current = [];
      setTimeout(() => all.forEach((url) => URL.revokeObjectURL(url)), 1000);
    };
  }, []);

  return urls;
}
