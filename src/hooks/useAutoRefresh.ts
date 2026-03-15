import { create } from 'zustand';

interface AutoRefreshState {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
}

export const useAutoRefresh = create<AutoRefreshState>((set) => ({
  enabled: true,
  toggle: () => set((state) => ({ enabled: !state.enabled })),
  setEnabled: (enabled) => set({ enabled }),
}));
