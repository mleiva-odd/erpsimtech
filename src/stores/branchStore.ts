import { create } from 'zustand';

interface BranchState {
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  selectedBranchId: null, // null significa "Global" (Todas las tiendas)
  setSelectedBranchId: (id) => set({ selectedBranchId: id }),
}));
