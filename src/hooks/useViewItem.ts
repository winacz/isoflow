import { useMemo } from 'react';
import { useScene } from 'src/hooks/useScene';
import type { ViewItem } from 'src/types';

/**
 * Current-view placement for a model item id.
 * Returns `null` when the id is not on the active plan (e.g. stale selection
 * after switching views) — never throws.
 */
export const useViewItem = (id: string): ViewItem | null => {
  const { items } = useScene();

  return useMemo(() => {
    return items.find((item) => item.id === id) ?? null;
  }, [items, id]);
};
