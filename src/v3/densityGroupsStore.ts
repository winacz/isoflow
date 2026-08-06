import { create } from 'zustand';

/** Scratch toggle for the 2D v3 density-group ring overlay. */
type DensityGroupsDebugState = {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  toggle: () => void;
};

export const useDensityGroupsDebugStore = create<DensityGroupsDebugState>(
  (set) => {
    return {
      visible: false,
      setVisible: (visible) => {
        set({ visible });
      },
      toggle: () => {
        set((state) => {
          return { visible: !state.visible };
        });
      }
    };
  }
);
