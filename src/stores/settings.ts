import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { tauriStorage } from '../lib/tauri-storage';

export interface SettingsState {
  eqEnabled: boolean;
  eqGains: number[];
  eqPreset: string;
  sidebarCollapsed: boolean;
  setEqEnabled: (enabled: boolean) => void;
  setEqGains: (gains: number[]) => void;
  setEqPreset: (preset: string) => void;
  setEqBand: (index: number, gain: number) => void;
  toggleSidebar: () => void;
}

const DEFAULT_EQ_GAINS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const DEFAULTS = {
  eqEnabled: false,
  eqGains: DEFAULT_EQ_GAINS,
  eqPreset: 'flat',
  sidebarCollapsed: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setEqEnabled: (eqEnabled) => set({ eqEnabled }),
      setEqGains: (eqGains) => set({ eqGains, eqPreset: 'custom' }),
      setEqPreset: (eqPreset) => set({ eqPreset }),
      setEqBand: (index, gain) =>
        set((s) => {
          const eqGains = [...s.eqGains];
          eqGains[index] = gain;
          return { eqGains, eqPreset: 'custom' };
        }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'sc-settings',
      storage: createJSONStorage(() => tauriStorage),
      version: 4,
      partialize: (s) => ({
        eqEnabled: s.eqEnabled,
        eqGains: s.eqGains,
        eqPreset: s.eqPreset,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    },
  ),
);
