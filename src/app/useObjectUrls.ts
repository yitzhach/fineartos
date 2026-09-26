/**
 * Object URLs for a set of stored images, made together and revoked
 * together. One map per set for the whole app: two windows onto the same
 * project would otherwise each make a URL for the same blob, and one closing
 * would revoke the other's.
 */
import { useEffect, useState } from 'react';
import type { Repository } from '../persistence/repository';

/** `key` is the image ids, sorted and joined with commas. */
export function useObjectUrls(repo: Repository, key: string): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const map: Record<string, string> = {};
      for (const id of ids) {
        const image = await repo.getImage(id);
        if (image) {
          const url = URL.createObjectURL(image.blob);
          created.push(url);
          map[id] = url;
        }
      }
      if (!cancelled) setUrls(map);
    })();
    return () => {
      cancelled = true;
      // Revoked a beat later: React can still paint one frame with the old
      // src, and a revoked blob URL in an <img> is a console error.
      const stale = [...created];
      setTimeout(() => stale.forEach((url) => URL.revokeObjectURL(url)), 1000);
    };
  }, [key, repo]);

  return urls;
}
