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

export const useNodeDragStore = create<NodeDragState>((set) => {
  return {
    tiles: {},
    mounts: {},
    setLive: (tiles, mounts) => {
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
