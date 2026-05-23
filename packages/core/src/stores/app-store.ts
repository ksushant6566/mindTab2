import { create } from "zustand";
import { persist } from "zustand/middleware";

export const EActiveLayout = {
  Goals: "Goals",
  Habits: "Habits",
  Notes: "Notes",
} as const;

export type ActiveLayout = (typeof EActiveLayout)[keyof typeof EActiveLayout];

export const appearanceThemes = ["midnight", "graphite", "paper"] as const;
export type AppearanceTheme = (typeof appearanceThemes)[number];

export const fontPresets = ["inter", "geist", "system"] as const;
export type FontPreset = (typeof fontPresets)[number];

interface AppState {
  layoutVersion: number;
  activeElement: ActiveLayout;
  activeProjectId: string | null;
  appearanceTheme: AppearanceTheme;
  fontPreset: FontPreset;
  setLayoutVersion: (version: number) => void;
  setActiveElement: (element: ActiveLayout) => void;
  setActiveProjectId: (projectId: string | null) => void;
  setAppearanceTheme: (theme: AppearanceTheme) => void;
  setFontPreset: (font: FontPreset) => void;
  setAppearance: (appearance: {
    theme?: AppearanceTheme;
    font?: FontPreset;
  }) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      layoutVersion: 1,
      activeElement: EActiveLayout.Goals,
      activeProjectId: null,
      appearanceTheme: "midnight",
      fontPreset: "inter",
      setLayoutVersion: (version) => set({ layoutVersion: version }),
      setActiveElement: (element) => set({ activeElement: element }),
      setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
      setAppearanceTheme: (theme) => set({ appearanceTheme: theme }),
      setFontPreset: (font) => set({ fontPreset: font }),
      setAppearance: ({ theme, font }) =>
        set((state) => ({
          appearanceTheme: theme ?? state.appearanceTheme,
          fontPreset: font ?? state.fontPreset,
        })),
    }),
    {
      name: "mindtab-app-storage",
      partialize: (state) => ({
        layoutVersion: state.layoutVersion,
        activeElement: state.activeElement,
        activeProjectId: state.activeProjectId,
        appearanceTheme: state.appearanceTheme,
        fontPreset: state.fontPreset,
      }),
    }
  )
);
