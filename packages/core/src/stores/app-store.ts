import { create } from "zustand";
import { persist } from "zustand/middleware";

export const EActiveLayout = {
  Goals: "Goals",
  Habits: "Habits",
  Notes: "Notes",
} as const;

export type ActiveLayout = (typeof EActiveLayout)[keyof typeof EActiveLayout];

interface AppState {
  layoutVersion: number;
  activeElement: ActiveLayout;
  activeProjectId: string | null;
  setLayoutVersion: (version: number) => void;
  setActiveElement: (element: ActiveLayout) => void;
  setActiveProjectId: (projectId: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      layoutVersion: 1,
      activeElement: EActiveLayout.Goals,
      activeProjectId: null,
      setLayoutVersion: (version) => set({ layoutVersion: version }),
      setActiveElement: (element) => set({ activeElement: element }),
      setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
    }),
    {
      name: "mindtab-app-storage",
      partialize: (state) => ({
        layoutVersion: state.layoutVersion,
        activeElement: state.activeElement,
        activeProjectId: state.activeProjectId,
      }),
    }
  )
);
