import { create } from "zustand";
import { persist } from "zustand/middleware";

export const EActiveLayout = {
  Tasks: "Tasks",
  Calendar: "Calendar",
  Notes: "Notes",
} as const;

export type ActiveLayout = (typeof EActiveLayout)[keyof typeof EActiveLayout];

export const appearanceThemes = ["midnight", "graphite", "paper"] as const;
export type AppearanceTheme = (typeof appearanceThemes)[number];

export const fontPresets = ["codex", "linear", "github", "notion", "raycast", "system"] as const;
export type FontPreset = (typeof fontPresets)[number];
export type LegacyFontPreset = "inter" | "geist";
export type StoredFontPreset = FontPreset | LegacyFontPreset;

export function normalizeFontPreset(font: string | null | undefined): FontPreset {
  if (font === "inter" || font === "codex" || !font) return "codex";
  if (font === "geist") return "raycast";
  if ((fontPresets as readonly string[]).includes(font)) return font as FontPreset;
  return "codex";
}

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
      activeElement: EActiveLayout.Tasks,
      activeProjectId: null,
      appearanceTheme: "midnight",
      fontPreset: "codex",
      setLayoutVersion: (version) => set({ layoutVersion: version }),
      setActiveElement: (element) => set({ activeElement: element }),
      setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
      setAppearanceTheme: (theme) => set({ appearanceTheme: theme }),
      setFontPreset: (font) => set({ fontPreset: font }),
      setAppearance: ({ theme, font }) =>
        set((state) => ({
          appearanceTheme: theme ?? state.appearanceTheme,
          fontPreset: font ? normalizeFontPreset(font) : state.fontPreset,
        })),
    }),
    {
      name: "mindtab-app-storage",
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined;
        return {
          ...currentState,
          ...persisted,
          fontPreset: normalizeFontPreset(persisted?.fontPreset),
        };
      },
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
