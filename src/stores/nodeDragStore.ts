import { create } from 'zustand';
import type { Coords } from 'src/types';

export type NodeDragMount =
  | { parentId?: string; rackUnit?: number }
  | 'clear';

type NodeDragState = {
  /** Live tile positions while dragging — not written to the model until mouseup. */
  tiles: Record<string, Coords>;
  /** Mount/unmount pending until mouseup. */
  mounts: Record<string, NodeDragMount>;
  setLive: (
    tiles: Record<string, Coords>,
    mounts?: Record<string, NodeDragMount>
  ) => void;
  clear: () => void;
};

const tilesEqual = (
  a: Record<string, Coords>,
  b: Record<string, Coords>
): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const at = a[key];
    const bt = b[key];
    if (!bt || at.x !== bt.x || at.y !== bt.y) return false;
  }
  return true;
};

export const useNodeDragStore = create<NodeDragState>((set, get) => {
  return {
    tiles: {},
    mounts: {},
    setLive: (tiles, mounts) => {
      const prev = get();
      if (!mounts && tilesEqual(prev.tiles, tiles)) {
        return;
      }
      set((state) => {
        return {
          tiles,
          mounts: mounts
            ? { ...state.mounts, ...mounts }
            : state.mounts
        };
      });
    },
    clear: () => {
      set({ tiles: {}, mounts: {} });
    }
  };
});
