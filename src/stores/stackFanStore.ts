import { create } from 'zustand';

/** Ephemeral UI state for stack-badge hover / grab (not persisted). */
interface StackFanStore {
  hoveredKey: string | null;
  pinnedKey: string | null;
  /** Connector under a fan handle — stronger emphasize + dim siblings. */
  highlightedConnectorId: string | null;
  setHoveredKey: (key: string | null) => void;
  setPinnedKey: (key: string | null) => void;
  setHighlightedConnectorId: (id: string | null) => void;
  clearPinned: () => void;
}

export const useStackFanStore = create<StackFanStore>((set) => {
  return {
    hoveredKey: null,
    pinnedKey: null,
    highlightedConnectorId: null,
    setHoveredKey: (hoveredKey) => {
      set({ hoveredKey });
    },
    setPinnedKey: (pinnedKey) => {
      set({ pinnedKey });
    },
    setHighlightedConnectorId: (highlightedConnectorId) => {
      set({ highlightedConnectorId });
    },
    clearPinned: () => {
      set({ pinnedKey: null, highlightedConnectorId: null });
    }
  };
});

export const getActiveStackKey = (state: StackFanStore) => {
  return state.pinnedKey ?? state.hoveredKey;
};
