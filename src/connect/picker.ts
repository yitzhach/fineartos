/**
 * The picture picker a visitor is handed at a show.
 *
 * Two questions, both answered here rather than in the component: which
 * pictures are on offer, and which ones did this visitor point at. Neither is
 * guessed. A filter shows what the artist has actually marked — "current
 * show" and "available" are both things somebody typed, so a filter is
 * allowed to be honestly empty rather than quietly falling back to everything.
 *
 * Hiding is the artist's, not the visitor's. A hidden picture is gone from
 * the guest's view entirely and only dimmed in the studio's, so it can be put
 * back with one tap instead of being lost.
 *
 * DOM-free, like the rest of the model layer.
 */

import { isInCurrentShow, isShownToVisitors, statusOf, type Photo } from '../photo/photo';

export type PickFilter = 'show' | 'available' | 'all';

/** What each filter would show, before hiding is taken into account. */
export function matchesFilter(photo: Photo, filter: PickFilter): boolean {
  if (filter === 'show') return isInCurrentShow(photo);
  if (filter === 'available') return statusOf(photo) === 'available';
  return true;
}

/**
 * The pictures the picker draws, in the artist's own order.
 *
 * In guest mode a hidden picture is not in the list at all. In the studio
 * view it stays, dimmed, because the artist needs somewhere to un-hide it.
 */
export function picksFor(
  photos: Photo[],
  filter: PickFilter,
  options: { guestMode: boolean },
): Photo[] {
  return photos.filter(
    (photo) =>
      matchesFilter(photo, filter) && (!options.guestMode || isShownToVisitors(photo)),
  );
}

/** The number on each filter chip — the same count the chip will show. */
export function filterCounts(
  photos: Photo[],
  options: { guestMode: boolean },
): Record<PickFilter, number> {
  return {
    show: picksFor(photos, 'show', options).length,
    available: picksFor(photos, 'available', options).length,
    all: picksFor(photos, 'all', options).length,
  };
}

/**
 * The pictures behind a list of picked ids, in the order they were picked.
 * An id with no picture left behind it is dropped rather than drawn as a gap:
 * the picture was deleted after the visitor liked it.
 */
export function pickedPhotos(photos: Photo[], likedPhotoIds: string[]): Photo[] {
  return likedPhotoIds
    .map((id) => photos.find((photo) => photo.id === id))
    .filter((photo): photo is Photo => Boolean(photo));
}
