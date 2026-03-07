import { TextStyle, ViewStyle } from "react-native";

// ---------------------------------------------------------------------------
// Typography Scale
// ---------------------------------------------------------------------------

export const typography = {
  display: { fontSize: 32, fontWeight: "700", lineHeight: 38 } as TextStyle,
  title1: { fontSize: 24, fontWeight: "700", lineHeight: 31 } as TextStyle,
  title2: { fontSize: 20, fontWeight: "600", lineHeight: 26 } as TextStyle,
  title3: { fontSize: 17, fontWeight: "600", lineHeight: 24 } as TextStyle,
  body: { fontSize: 16, fontWeight: "400", lineHeight: 24 } as TextStyle,
  callout: { fontSize: 15, fontWeight: "500", lineHeight: 21 } as TextStyle,
  subhead: { fontSize: 14, fontWeight: "400", lineHeight: 20 } as TextStyle,
  caption: { fontSize: 12, fontWeight: "500", lineHeight: 16 } as TextStyle,
  micro: { fontSize: 10, fontWeight: "600", lineHeight: 12 } as TextStyle,
} as const;

export const readerTypography = {
  title: { fontSize: 28, fontWeight: "700", lineHeight: 36 } as TextStyle,
  h2: { fontSize: 24, fontWeight: "600", lineHeight: 32 } as TextStyle,
  h3: { fontSize: 20, fontWeight: "600", lineHeight: 28 } as TextStyle,
  body: { fontSize: 18, fontWeight: "400", lineHeight: 32 } as TextStyle,
  bold: { fontSize: 18, fontWeight: "600", lineHeight: 32 } as TextStyle,
  quote: { fontSize: 18, fontStyle: "italic", lineHeight: 32 } as TextStyle,
  code: { fontSize: 15, fontWeight: "400", lineHeight: 23 } as TextStyle,
  meta: { fontSize: 14, fontWeight: "400", lineHeight: 20 } as TextStyle,
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
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  } as ViewStyle,
  high: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  } as ViewStyle,
} as const;
