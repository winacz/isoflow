import { create } from 'zustand';

type CabinetSnapState = {
  cabinetId: string | null;
  unit: number | null;
  setHighlight: (cabinetId: string | null, unit: number | null) => void;
  clear: () => void;
};

export const useCabinetSnapStore = create<CabinetSnapState>((set) => {
  return {
    cabinetId: null,
    unit: null,
    setHighlight: (cabinetId, unit) => {
      set({ cabinetId, unit });
    },
    clear: () => {
      set({ cabinetId: null, unit: null });
    }
  };
});
