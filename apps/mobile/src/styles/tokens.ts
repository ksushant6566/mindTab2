import { TextStyle, ViewStyle } from "react-native";

// ---------------------------------------------------------------------------
// Typography Scale
// ---------------------------------------------------------------------------

export const typography = {
  display: { fontSize: 32, fontWeight: "800", lineHeight: 40 } as TextStyle,
  title1: { fontSize: 28, fontWeight: "700", lineHeight: 36 } as TextStyle,
  title2: { fontSize: 22, fontWeight: "700", lineHeight: 28 } as TextStyle,
  title3: { fontSize: 20, fontWeight: "600", lineHeight: 26 } as TextStyle,
  headline: { fontSize: 18, fontWeight: "700", lineHeight: 24 } as TextStyle,
  body: { fontSize: 16, fontWeight: "400", lineHeight: 22 } as TextStyle,
  callout: { fontSize: 15, fontWeight: "400", lineHeight: 20 } as TextStyle,
  subhead: { fontSize: 14, fontWeight: "500", lineHeight: 20 } as TextStyle,
  footnote: { fontSize: 13, fontWeight: "400", lineHeight: 18 } as TextStyle,
  caption1: { fontSize: 12, fontWeight: "400", lineHeight: 16 } as TextStyle,
  caption2: { fontSize: 11, fontWeight: "500", lineHeight: 14 } as TextStyle,
} as const;

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 48,
} as const;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

export const shadows = {
  low: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  } as ViewStyle,
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  } as ViewStyle,
  high: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  } as ViewStyle,
} as const;
