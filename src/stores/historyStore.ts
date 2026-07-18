import { create } from 'zustand';
import { Model } from 'src/types';

const MAX_HISTORY = 5;

interface HistoryStore {
  stack: Model[];
  canUndo: boolean;
  push: (model: Model) => void;
  pop: () => Model | null;
  clear: () => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => {
  return {
    stack: [],
    canUndo: false,
    push: (model) => {
      set((state) => {
        const stack = [...state.stack, model].slice(-MAX_HISTORY);
        return {
          stack,
          canUndo: stack.length > 0
        };
      });
    },
    pop: () => {
      const { stack } = get();
      if (stack.length === 0) return null;

      const next = [...stack];
      const model = next.pop() ?? null;

      set({
        stack: next,
        canUndo: next.length > 0
      });

      return model;
    },
    clear: () => {
      set({ stack: [], canUndo: false });
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
