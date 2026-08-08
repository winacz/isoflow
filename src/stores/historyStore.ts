import { create } from 'zustand';
import {
  enablePatches,
  produceWithPatches,
  applyPatches,
  type Patch
} from 'immer';
import { Model } from 'src/types';

enablePatches();

const MAX_HISTORY = 25;

type HistoryEntry = {
  /** Patches that turn the post-mutation model back into the pre-mutation model. */
  inversePatches: Patch[];
};

interface HistoryStore {
  stack: HistoryEntry[];
  canUndo: boolean;
  /**
   * Record how to undo a transition from `before` → `after` without storing
   * a full model snapshot (Immer patches share structure where possible).
   */
  pushTransition: (before: Model, after: Model) => void;
  /** Apply inverse patches to `current` and return the restored model. */
  undo: (current: Model) => Model | null;
  clear: () => void;
  /** @deprecated use pushTransition — kept for any stray callers */
  push: (model: Model) => void;
  pop: () => Model | null;
}

const assignModel = (draft: Model, next: Model) => {
  draft.version = next.version;
  draft.title = next.title;
  draft.description = next.description;
  draft.colors = next.colors;
  draft.icons = next.icons;
  draft.items = next.items;
  draft.views = next.views;
  draft.deviceTemplates = next.deviceTemplates;
};

export const useHistoryStore = create<HistoryStore>((set, get) => {
  return {
    stack: [],
    canUndo: false,
    pushTransition: (before, after) => {
      const [, , inversePatches] = produceWithPatches(before, (draft) => {
        assignModel(draft, after);
      });
      if (inversePatches.length === 0) return;

      set((state) => {
        const stack = [...state.stack, { inversePatches }].slice(-MAX_HISTORY);
        return {
          stack,
          canUndo: stack.length > 0
        };
      });
    },
    undo: (current) => {
      const { stack } = get();
      if (stack.length === 0) return null;

      const next = [...stack];
      const entry = next.pop();
      if (!entry) return null;

      set({
        stack: next,
        canUndo: next.length > 0
      });

      return applyPatches(current, entry.inversePatches) as Model;
    },
    clear: () => {
      set({ stack: [], canUndo: false });
    },
    // Legacy full-snapshot API (unused once useScene migrates)
    push: (model) => {
      get().pushTransition(model, model);
    },
    pop: () => {
      return null;
    }
  };
});

/** Depth of an open edit gesture (drag, place, draw connector…). */
let transactionDepth = 0;

export const enterHistoryTransaction = () => {
  transactionDepth += 1;
};

export const leaveHistoryTransaction = () => {
  transactionDepth = Math.max(0, transactionDepth - 1);
};

export const isHistoryTransactionOpen = () => {
  return transactionDepth > 0;
};

export const resetHistoryTransaction = () => {
  transactionDepth = 0;
};
