import type {
  AppearanceSettings,
  AppearanceTemplate,
  AppearanceTheme,
  CodeFontPreset,
  UIFontPreset,
} from "@mindtab/core";

export type TemplateVariant = "dark" | "light";

export type ThemeOption = {
  value: AppearanceTheme;
  label: string;
  description: string;
  background: string;
  foreground: string;
};

export type TemplateOption = {
  label: string;
  swatch: string;
  settings: Pick<AppearanceSettings, "appearanceTemplate" | "accentColor" | "backgroundColor" | "foregroundColor" | "contrast">;
};

export type FontOption<T extends string> = {
  value: T;
  label: string;
};

export const appearanceThemeOptions: ThemeOption[] = [
  { value: "system", label: "System", description: "Follow this device", background: "#181818", foreground: "#FFFFFF" },
  { value: "light", label: "Light", description: "Always use light mode", background: "#FFFFFF", foreground: "#0D0D0D" },
  { value: "dark", label: "Dark", description: "Always use dark mode", background: "#111111", foreground: "#FCFCFC" },
];

export const uiFontOptions: FontOption<UIFontPreset>[] = [
  { value: "geist", label: "Geist" },
  { value: "inter", label: "Inter" },
  { value: "system", label: "System" },
  { value: "sf-pro", label: "SF Pro" },
  { value: "helvetica", label: "Helvetica Neue" },
  { value: "avenir", label: "Avenir" },
  { value: "ibm-plex", label: "IBM Plex Sans" },
  { value: "roboto", label: "Roboto" },
  { value: "segoe", label: "Segoe UI" },
];

export const codeFontOptions: FontOption<CodeFontPreset>[] = [
  { value: "system-mono", label: "System Mono" },
  { value: "geist-mono", label: "Geist Mono" },
  { value: "sf-mono", label: "SF Mono" },
  { value: "jetbrains", label: "JetBrains Mono" },
  { value: "fira-code", label: "Fira Code" },
  { value: "cascadia", label: "Cascadia Code" },
  { value: "menlo", label: "Menlo" },
  { value: "monaco", label: "Monaco" },
];

export const appearanceTemplateOptions: Record<TemplateVariant, Partial<Record<AppearanceTemplate, TemplateOption>>> = {
  light: {
    absolutely: template("Absolutely", "absolutely", "#CC7D5E", "#F9F9F7", "#2D2D2B", 45),
    catppuccin: template("Catppuccin", "catppuccin", "#8839EF", "#EFF1F5", "#4C4F69", 45),
    codex: template("Codex", "codex", "#0169CC", "#FFFFFF", "#0D0D0D", 45),
    everforest: template("Everforest", "everforest", "#93B259", "#FDF6E3", "#5C6A72", 45),
    github: template("GitHub", "github", "#0969DA", "#FFFFFF", "#1F2328", 45),
    gruvbox: template("Gruvbox", "gruvbox", "#458588", "#FBF1C7", "#3C3836", 45),
    linear: template("Linear", "linear", "#5E6AD2", "#F7F8FA", "#2A3140", 45),
    notion: template("Notion", "notion", "#3183D8", "#FFFFFF", "#37352F", 45),
    one: template("One", "one", "#526FFF", "#FAFAFA", "#383A42", 45),
    proof: template("Proof", "proof", "#3D755D", "#F5F3ED", "#2F312D", 45),
    "rose-pine": template("Rose Pine", "rose-pine", "#D7827E", "#FAF4ED", "#575279", 45),
    solarized: template("Solarized", "solarized", "#B58900", "#FDF6E3", "#657B83", 45),
    "vscode-plus": template("VS Code Plus", "vscode-plus", "#007ACC", "#FFFFFF", "#000000", 45),
  },
  dark: {
    absolutely: template("Absolutely", "absolutely", "#CC7D5E", "#2D2D2B", "#F9F9F7", 60),
    ayu: template("Ayu", "ayu", "#E6B450", "#0B0E14", "#BFBDB6", 60),
    catppuccin: template("Catppuccin", "catppuccin", "#CBA6F7", "#1E1E2E", "#CDD6F4", 60),
    codex: template("Codex", "codex", "#0169CC", "#111111", "#FCFCFC", 60),
    dracula: template("Dracula", "dracula", "#FF79C6", "#282A36", "#F8F8F2", 60),
    everforest: template("Everforest", "everforest", "#A7C080", "#2D353B", "#D3C6AA", 60),
    github: template("GitHub", "github", "#1F6FEB", "#0D1117", "#E6EDF3", 60),
    gruvbox: template("Gruvbox", "gruvbox", "#458588", "#282828", "#EBDBB2", 60),
    linear: template("Linear", "linear", "#5E6AD2", "#17181D", "#E6E9EF", 60),
    lobster: template("Lobster", "lobster", "#FF5C5C", "#111827", "#E4E4E7", 60),
    material: template("Material", "material", "#80CBC4", "#212121", "#EEFFFF", 60),
    matrix: template("Matrix", "matrix", "#1EFF5A", "#040805", "#B8FFCA", 60),
    monokai: template("Monokai", "monokai", "#99947C", "#272822", "#F8F8F2", 60),
    "night-owl": template("Night Owl", "night-owl", "#44596B", "#011627", "#D6DEEB", 60),
    nord: template("Nord", "nord", "#88C0D0", "#2E3440", "#D8DEE9", 60),
    notion: template("Notion", "notion", "#3183D8", "#191919", "#D9D9D8", 60),
    one: template("One", "one", "#4D78CC", "#282C34", "#ABB2BF", 60),
    oscurange: template("Oscurange", "oscurange", "#F9B98C", "#0B0B0F", "#E6E6E6", 60),
    "rose-pine": template("Rose Pine", "rose-pine", "#EA9A97", "#232136", "#E0DEF4", 60),
    sentry: template("Sentry", "sentry", "#7055F6", "#2D2935", "#E6DFF9", 60),
    solarized: template("Solarized", "solarized", "#D30102", "#002B36", "#839496", 60),
    temple: template("Temple", "temple", "#E4F222", "#02120C", "#C7E6DA", 60),
    "tokyo-night": template("Tokyo Night", "tokyo-night", "#3D59A1", "#1A1B26", "#A9B1D6", 60),
    "vscode-plus": template("VS Code Plus", "vscode-plus", "#007ACC", "#1E1E1E", "#D4D4D4", 60),
  },
};

function template(
  label: string,
  appearanceTemplate: AppearanceTemplate,
  accentColor: string,
  backgroundColor: string,
  foregroundColor: string,
  contrast: number
): TemplateOption {
  return {
    label,
    swatch: accentColor,
    settings: {
      appearanceTemplate,
      accentColor,
      backgroundColor,
      foregroundColor,
      contrast,
    },
  };
}

export function getTemplateVariant(theme: AppearanceTheme, prefersDark: boolean): TemplateVariant {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

export function resolveAppearanceTemplateSettings(
  theme: AppearanceTheme,
  appearanceTemplate: AppearanceTemplate,
  prefersDark: boolean
): Partial<AppearanceSettings> {
  const variant = getTemplateVariant(theme, prefersDark);
  const resolvedTemplate = appearanceTemplateOptions[variant][appearanceTemplate] ?? appearanceTemplateOptions[variant].codex!;

  return {
    theme,
    ...resolvedTemplate.settings,
  };
}

export function resolveThemeChange(
  currentSettings: Pick<AppearanceSettings, "appearanceTemplate">,
  nextTheme: AppearanceTheme,
  prefersDark: boolean
): Partial<AppearanceSettings> {
  return resolveAppearanceTemplateSettings(nextTheme, currentSettings.appearanceTemplate, prefersDark);
}
