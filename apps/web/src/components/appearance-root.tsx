import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { normalizeCodeFontPreset, normalizeUIFontPreset, useAppStore, type AppearanceTheme } from "@mindtab/core";
import { useAuth } from "~/api/hooks/use-auth";

type AppearanceRootProps = {
  children: ReactNode;
};

export function AppearanceRoot({ children }: AppearanceRootProps) {
  const { user } = useAuth();
  const theme = useAppStore((state) => state.appearanceTheme);
  const uiFont = useAppStore((state) => state.uiFontPreset);
  const codeFont = useAppStore((state) => state.codeFontPreset);
  const accentColor = useAppStore((state) => state.accentColor);
  const backgroundColor = useAppStore((state) => state.backgroundColor);
  const foregroundColor = useAppStore((state) => state.foregroundColor);
  const contrast = useAppStore((state) => state.contrast);
  const fontSize = useAppStore((state) => state.fontSize);
  const setAppearance = useAppStore((state) => state.setAppearance);
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setPrefersDark(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    setAppearance({
      theme: user.theme,
      uiFont: user.uiFont,
      codeFont: user.codeFont,
      appearanceTemplate: user.appearanceTemplate,
      accentColor: user.accentColor,
      backgroundColor: user.backgroundColor,
      foregroundColor: user.foregroundColor,
      contrast: user.contrast,
      fontSize: user.fontSize,
      weekStartDay: user.weekStartDay,
      timeFormat: user.timeFormat,
      timeZone: user.timeZone,
    });
  }, [
    setAppearance,
    user?.accentColor,
    user?.appearanceTemplate,
    user?.backgroundColor,
    user?.codeFont,
    user?.contrast,
    user?.fontSize,
    user?.foregroundColor,
    user?.theme,
    user?.timeFormat,
    user?.timeZone,
    user?.uiFont,
    user?.weekStartDay,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme = resolveTheme(theme, prefersDark);
    const palette = buildCustomPalette({
      accentColor,
      backgroundColor,
      foregroundColor,
      contrast,
      fontSize,
    });

    root.dataset.appearanceMode = theme;
    root.dataset.theme = resolvedTheme === "light" ? "paper" : "midnight";
    root.dataset.resolvedTheme = resolvedTheme;
    root.dataset.uiFont = normalizeUIFontPreset(uiFont);
    root.dataset.codeFont = normalizeCodeFontPreset(codeFont);
    root.classList.toggle("dark", resolvedTheme === "dark");
    Object.entries(palette).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [accentColor, backgroundColor, codeFont, contrast, fontSize, foregroundColor, prefersDark, theme, uiFont]);

  const resolvedTheme = resolveTheme(theme, prefersDark);

  return (
    <>
      {children}
      <Toaster theme={resolvedTheme === "light" ? "light" : "dark"} />
    </>
  );
}

type PaletteInput = {
  accentColor: string;
  backgroundColor: string;
  foregroundColor: string;
  contrast: number;
  fontSize: number;
};

function buildCustomPalette({
  accentColor,
  backgroundColor,
  foregroundColor,
  contrast,
  fontSize,
}: PaletteInput) {
  const borderRatio = 0.1 + (contrast / 100) * 0.22;
  const elevatedRatio = 0.04 + (contrast / 100) * 0.06;
  const softRatio = 0.08 + (contrast / 100) * 0.1;
  const bgElev = mixHex(backgroundColor, foregroundColor, elevatedRatio);
  const bgSoft = mixHex(backgroundColor, foregroundColor, softRatio);
  const border = mixHex(backgroundColor, foregroundColor, borderRatio);
  const borderStrong = mixHex(backgroundColor, foregroundColor, Math.min(0.42, borderRatio + 0.1));
  const mutedForeground = mixHex(foregroundColor, backgroundColor, 0.38);
  const lowContrastForeground = mixHex(foregroundColor, backgroundColor, 0.58);

  return {
    "--bg": backgroundColor,
    "--bg-elev": bgElev,
    "--bg-soft": bgSoft,
    "--bg-hover": mixHex(backgroundColor, foregroundColor, Math.min(0.32, softRatio + 0.1)),
    "--border": border,
    "--border-2": borderStrong,
    "--text": foregroundColor,
    "--text-2": lowContrastForeground,
    "--text-3": mutedForeground,
    "--text-4": mixHex(foregroundColor, backgroundColor, 0.72),
    "--ink": accentColor,
    "--ink-line": toRgba(accentColor, 0.42),
    "--ink-soft": toRgba(accentColor, 0.16),
    "--ink-2": mixHex(accentColor, foregroundColor, 0.18),
    "--background": toHslTriplet(backgroundColor),
    "--foreground": toHslTriplet(foregroundColor),
    "--card": toHslTriplet(bgElev),
    "--card-foreground": toHslTriplet(foregroundColor),
    "--popover": toHslTriplet(bgElev),
    "--popover-foreground": toHslTriplet(foregroundColor),
    "--primary": toHslTriplet(accentColor),
    "--primary-foreground": toHslTriplet(getReadableTextColor(accentColor)),
    "--secondary": toHslTriplet(bgSoft),
    "--secondary-foreground": toHslTriplet(foregroundColor),
    "--muted": toHslTriplet(bgSoft),
    "--muted-foreground": toHslTriplet(mutedForeground),
    "--accent": toHslTriplet(accentColor),
    "--accent-foreground": toHslTriplet(getReadableTextColor(accentColor)),
    "--border-hsl": toHslTriplet(border),
    "--input": toHslTriplet(borderStrong),
    "--ring": toHslTriplet(accentColor),
    "--type-body-size": `${fontSize / 16}rem`,
    "--type-label-size": `${fontSize / 16}rem`,
    "--type-title-size": `${(fontSize + 4) / 16}rem`,
    "--type-meta-size": `${Math.max(11, fontSize - 2) / 16}rem`,
    "--type-code-size": `${Math.max(11, fontSize - 2) / 16}rem`,
  };
}

function resolveTheme(theme: AppearanceTheme, prefersDark: boolean) {
  if (theme !== "system") return theme;
  return prefersDark ? "dark" : "light";
}

function hexToRgb(hex: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "0F0F11";
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mixHex(from: string, to: string, amount: number) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toHslTriplet(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r1:
        h = 60 * (((g1 - b1) / d) % 6);
        break;
      case g1:
        h = 60 * ((b1 - r1) / d + 2);
        break;
      default:
        h = 60 * ((r1 - g1) / d + 4);
    }
  }

  if (h < 0) h += 360;
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function getReadableTextColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#0F0F11" : "#FFFFFF";
}
