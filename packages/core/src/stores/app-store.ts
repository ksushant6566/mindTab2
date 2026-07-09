import { create } from "zustand";
import { persist } from "zustand/middleware";

export const EActiveLayout = {
  Tasks: "Tasks",
  Calendar: "Calendar",
  Notes: "Notes",
} as const;

export type ActiveLayout = (typeof EActiveLayout)[keyof typeof EActiveLayout];

export const appearanceThemes = ["system", "dark", "light"] as const;
export type AppearanceTheme = (typeof appearanceThemes)[number];

export const uiFontPresets = [
  "geist",
  "inter",
  "system",
  "sf-pro",
  "helvetica",
  "avenir",
  "ibm-plex",
  "roboto",
  "segoe",
] as const;
export type UIFontPreset = (typeof uiFontPresets)[number];
export type LegacyFontPreset = "codex" | "linear" | "github" | "notion" | "raycast" | "inter" | "satoshi";
export type StoredUIFontPreset = UIFontPreset | LegacyFontPreset;

export const codeFontPresets = [
  "system-mono",
  "geist-mono",
  "sf-mono",
  "jetbrains",
  "fira-code",
  "cascadia",
  "menlo",
  "monaco",
] as const;
export type CodeFontPreset = (typeof codeFontPresets)[number];
export type LegacyCodeFontPreset = "jetbrains" | "geist-mono" | "sf-mono" | "fira-code";

export const appearanceTemplates = [
  "absolutely",
  "ayu",
  "catppuccin",
  "codex",
  "dracula",
  "everforest",
  "github",
  "gruvbox",
  "linear",
  "lobster",
  "material",
  "matrix",
  "monokai",
  "night-owl",
  "nord",
  "notion",
  "one",
  "oscurange",
  "proof",
  "rose-pine",
  "sentry",
  "solarized",
  "temple",
  "tokyo-night",
  "vscode-plus",
] as const;
export type AppearanceTemplate = (typeof appearanceTemplates)[number];

export const weekStartDays = ["monday", "sunday", "saturday"] as const;
export type WeekStartDay = (typeof weekStartDays)[number];

export const timeFormats = ["12h", "24h"] as const;
export type TimeFormat = (typeof timeFormats)[number];

export type AppearanceSettings = {
  theme: AppearanceTheme;
  uiFont: UIFontPreset;
  codeFont: CodeFontPreset;
  appearanceTemplate: AppearanceTemplate;
  accentColor: string;
  backgroundColor: string;
  foregroundColor: string;
  contrast: number;
  fontSize: number;
  radius: number;
};

export type GeneralSettings = {
  weekStartDay: WeekStartDay;
  timeFormat: TimeFormat;
  timeZone: string;
};

export const defaultAppearanceSettings: AppearanceSettings = {
  theme: "system",
  uiFont: "geist",
  codeFont: "system-mono",
  appearanceTemplate: "codex",
  accentColor: "#0169CC",
  backgroundColor: "#111111",
  foregroundColor: "#FCFCFC",
  contrast: 60,
  fontSize: 14,
  radius: 7,
};

export const defaultGeneralSettings: GeneralSettings = {
  weekStartDay: "monday",
  timeFormat: "12h",
  timeZone: "auto",
};

export function normalizeUIFontPreset(font: string | null | undefined): UIFontPreset {
  if (!font) return defaultAppearanceSettings.uiFont;
  if ((uiFontPresets as readonly string[]).includes(font)) return font as UIFontPreset;
  if (font === "system" || font === "github" || font === "notion") return "system";
  if (font === "codex" || font === "linear" || font === "raycast" || font === "satoshi") return "geist";
  return defaultAppearanceSettings.uiFont;
}

export function normalizeCodeFontPreset(font: string | null | undefined): CodeFontPreset {
  if (!font) return defaultAppearanceSettings.codeFont;
  if ((codeFontPresets as readonly string[]).includes(font)) return font as CodeFontPreset;
  return defaultAppearanceSettings.codeFont;
}

export function normalizeAppearanceTemplate(template: string | null | undefined): AppearanceTemplate {
  if ((appearanceTemplates as readonly string[]).includes(template ?? "")) return template as AppearanceTemplate;
  return defaultAppearanceSettings.appearanceTemplate;
}

export function normalizeWeekStartDay(day: string | null | undefined): WeekStartDay {
  if ((weekStartDays as readonly string[]).includes(day ?? "")) return day as WeekStartDay;
  return defaultGeneralSettings.weekStartDay;
}

export function normalizeTimeFormat(format: string | null | undefined): TimeFormat {
  if ((timeFormats as readonly string[]).includes(format ?? "")) return format as TimeFormat;
  return defaultGeneralSettings.timeFormat;
}

function normalizeHexColor(value: string | null | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

function normalizeRange(value: number | null | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeAppearanceSettings(
  settings: (Partial<AppearanceSettings> & { font?: string | null }) | null | undefined
): AppearanceSettings {
  return {
    theme: appearanceThemes.includes(settings?.theme as AppearanceTheme) ? settings!.theme! : defaultAppearanceSettings.theme,
    uiFont: normalizeUIFontPreset(settings?.uiFont ?? settings?.font),
    codeFont: normalizeCodeFontPreset(settings?.codeFont),
    appearanceTemplate: normalizeAppearanceTemplate(settings?.appearanceTemplate),
    accentColor: normalizeHexColor(settings?.accentColor, defaultAppearanceSettings.accentColor),
    backgroundColor: normalizeHexColor(settings?.backgroundColor, defaultAppearanceSettings.backgroundColor),
    foregroundColor: normalizeHexColor(settings?.foregroundColor, defaultAppearanceSettings.foregroundColor),
    contrast: normalizeRange(settings?.contrast, defaultAppearanceSettings.contrast, 0, 100),
    fontSize: normalizeRange(settings?.fontSize, defaultAppearanceSettings.fontSize, 12, 20),
    radius: normalizeRange(settings?.radius, defaultAppearanceSettings.radius, 0, 20),
  };
}

export function normalizeGeneralSettings(settings: Partial<GeneralSettings> | null | undefined): GeneralSettings {
  return {
    weekStartDay: normalizeWeekStartDay(settings?.weekStartDay),
    timeFormat: normalizeTimeFormat(settings?.timeFormat),
    timeZone: settings?.timeZone && settings.timeZone.length <= 64 ? settings.timeZone : defaultGeneralSettings.timeZone,
  };
}

interface AppState {
  layoutVersion: number;
  activeElement: ActiveLayout;
  activeProjectId: string | null;
  appearanceTheme: AppearanceTheme;
  uiFontPreset: UIFontPreset;
  codeFontPreset: CodeFontPreset;
  appearanceTemplate: AppearanceTemplate;
  accentColor: string;
  backgroundColor: string;
  foregroundColor: string;
  contrast: number;
  fontSize: number;
  radius: number;
  weekStartDay: WeekStartDay;
  timeFormat: TimeFormat;
  timeZone: string;
  setLayoutVersion: (version: number) => void;
  setActiveElement: (element: ActiveLayout) => void;
  setActiveProjectId: (projectId: string | null) => void;
  setAppearanceTheme: (theme: AppearanceTheme) => void;
  setUIFontPreset: (font: UIFontPreset) => void;
  setCodeFontPreset: (font: CodeFontPreset) => void;
  setAppearance: (appearance: Partial<AppearanceSettings & GeneralSettings>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      layoutVersion: 1,
      activeElement: EActiveLayout.Tasks,
      activeProjectId: null,
      appearanceTheme: defaultAppearanceSettings.theme,
      uiFontPreset: defaultAppearanceSettings.uiFont,
      codeFontPreset: defaultAppearanceSettings.codeFont,
      appearanceTemplate: defaultAppearanceSettings.appearanceTemplate,
      accentColor: defaultAppearanceSettings.accentColor,
      backgroundColor: defaultAppearanceSettings.backgroundColor,
      foregroundColor: defaultAppearanceSettings.foregroundColor,
      contrast: defaultAppearanceSettings.contrast,
      fontSize: defaultAppearanceSettings.fontSize,
      radius: defaultAppearanceSettings.radius,
      weekStartDay: defaultGeneralSettings.weekStartDay,
      timeFormat: defaultGeneralSettings.timeFormat,
      timeZone: defaultGeneralSettings.timeZone,
      setLayoutVersion: (version) => set({ layoutVersion: version }),
      setActiveElement: (element) => set({ activeElement: element }),
      setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
      setAppearanceTheme: (theme) => set({ appearanceTheme: theme }),
      setUIFontPreset: (font) => set({ uiFontPreset: font }),
      setCodeFontPreset: (font) => set({ codeFontPreset: font }),
      setAppearance: (appearance) =>
        set((state) => ({
          appearanceTheme: appearance.theme ?? state.appearanceTheme,
          uiFontPreset: appearance.uiFont ? normalizeUIFontPreset(appearance.uiFont) : state.uiFontPreset,
          codeFontPreset: appearance.codeFont ? normalizeCodeFontPreset(appearance.codeFont) : state.codeFontPreset,
          appearanceTemplate: appearance.appearanceTemplate
            ? normalizeAppearanceTemplate(appearance.appearanceTemplate)
            : state.appearanceTemplate,
          accentColor: normalizeHexColor(appearance.accentColor, state.accentColor),
          backgroundColor: normalizeHexColor(appearance.backgroundColor, state.backgroundColor),
          foregroundColor: normalizeHexColor(appearance.foregroundColor, state.foregroundColor),
          contrast: normalizeRange(appearance.contrast, state.contrast, 0, 100),
          fontSize: normalizeRange(appearance.fontSize, state.fontSize, 12, 20),
          radius: normalizeRange(appearance.radius, state.radius, 0, 20),
          weekStartDay: appearance.weekStartDay ? normalizeWeekStartDay(appearance.weekStartDay) : state.weekStartDay,
          timeFormat: appearance.timeFormat ? normalizeTimeFormat(appearance.timeFormat) : state.timeFormat,
          timeZone: appearance.timeZone && appearance.timeZone.length <= 64 ? appearance.timeZone : state.timeZone,
        })),
    }),
    {
      name: "mindtab-app-storage",
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined;
        return {
          ...currentState,
          ...persisted,
          uiFontPreset: normalizeUIFontPreset(persisted?.uiFontPreset ?? (persisted as Partial<AppState> & { fontPreset?: string })?.fontPreset),
          codeFontPreset: normalizeCodeFontPreset(persisted?.codeFontPreset),
          appearanceTemplate: normalizeAppearanceTemplate(persisted?.appearanceTemplate),
          accentColor: normalizeHexColor(persisted?.accentColor, currentState.accentColor),
          backgroundColor: normalizeHexColor(persisted?.backgroundColor, currentState.backgroundColor),
          foregroundColor: normalizeHexColor(persisted?.foregroundColor, currentState.foregroundColor),
          contrast: normalizeRange(persisted?.contrast, currentState.contrast, 0, 100),
          fontSize: normalizeRange(persisted?.fontSize, currentState.fontSize, 12, 20),
          radius: normalizeRange(persisted?.radius, currentState.radius, 0, 20),
          weekStartDay: normalizeWeekStartDay(persisted?.weekStartDay),
          timeFormat: normalizeTimeFormat(persisted?.timeFormat),
          timeZone: persisted?.timeZone && persisted.timeZone.length <= 64 ? persisted.timeZone : currentState.timeZone,
        };
      },
      partialize: (state) => ({
        layoutVersion: state.layoutVersion,
        activeElement: state.activeElement,
        activeProjectId: state.activeProjectId,
        appearanceTheme: state.appearanceTheme,
        uiFontPreset: state.uiFontPreset,
        codeFontPreset: state.codeFontPreset,
        appearanceTemplate: state.appearanceTemplate,
        accentColor: state.accentColor,
        backgroundColor: state.backgroundColor,
        foregroundColor: state.foregroundColor,
        contrast: state.contrast,
        fontSize: state.fontSize,
        radius: state.radius,
        weekStartDay: state.weekStartDay,
        timeFormat: state.timeFormat,
        timeZone: state.timeZone,
      }),
    }
  )
);
