export const mindtabColors = {
  bg: "#0a0a0a",
  bgElev: "#141414",
  bgSoft: "#1c1c1c",
  bgHover: "#262626",
  border: "#262626",
  border2: "#333333",
  text: "#fafafa",
  text2: "#a3a3a3",
  text3: "#737373",
  text4: "#555555",
  ink: "#fafafa",
  inkSoft: "#fafafa26",
  inkLine: "#fafafa66",
  ink2: "#ffffff",
  violet: "#7c6df2",
  amber: "#f5b344",
  rose: "#ff4d6d",
  cyan: "#52d9ff",
  black: "#0a0a0a",
  white: "#ffffff",
} as const;

export const mindtabRadii = {
  xs: 3,
  sm: 5,
  md: 7,
  lg: 10,
  xl: 14,
  pill: 999,
} as const;

export const mindtabFonts = {
  sans: "Geist",
  mono: "System Mono",
} as const;

export const mindtabEasing = {
  out: "cubic-bezier(.16,.84,.32,1)",
} as const;

export const primitiveVariants = {
  button: ["default", "secondary", "destructive", "outline", "ghost", "link"],
  badge: ["default", "secondary", "destructive", "outline", "success", "warning"],
  chip: ["default", "selected"],
} as const;

export const primitiveSizes = {
  button: ["sm", "default", "lg", "icon"],
  chip: ["sm", "md"],
} as const;

export type ButtonVariant = (typeof primitiveVariants.button)[number];
export type ButtonSize = (typeof primitiveSizes.button)[number];
export type BadgeVariant = (typeof primitiveVariants.badge)[number];
export type ChipSize = (typeof primitiveSizes.chip)[number];
