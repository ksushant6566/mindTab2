import { mindtabColors } from "@mindtab/shared";

export const colors = {
  // Backgrounds
  bg: {
    primary: mindtabColors.bg,
    elevated: mindtabColors.bgElev,
    surface: mindtabColors.bgSoft,
    overlay: "rgba(0,0,0,0.5)",
    input: mindtabColors.bgHover,
    bubble: mindtabColors.text,
  },
  // Text
  text: {
    primary: mindtabColors.text,
    secondary: mindtabColors.text2,
    muted: mindtabColors.text3,
    reader: mindtabColors.text,
    dim: mindtabColors.text4,
    inverse: mindtabColors.black,
  },
  // Borders
  border: {
    default: mindtabColors.border,
    subtle: mindtabColors.bgSoft,
    focus: mindtabColors.ink,
    input: mindtabColors.border2,
  },
  // Accent
  accent: {
    indigo: mindtabColors.ink,
    indigoMuted: mindtabColors.inkSoft,
    ink: mindtabColors.ink,
    inkMuted: mindtabColors.inkSoft,
    violet: mindtabColors.violet,
  },
  // Status
  status: {
    pending: "#a3a3a3",
    active: "#60a5fa",
    completed: "#22c55e",
    archived: "#78716c",
    paused: "#fbbf24",
    checked: "#34d399",
  },
  // Priority
  priority: {
    p1: "#ef4444",
    p2: "#f97316",
    p3: mindtabColors.cyan,
    p4: "#6b7280",
  },
  // Impact
  impact: {
    low: "#6b7280",
    medium: "#fbbf24",
    high: "#f59e0b",
  },
  // Gamification
  xp: {
    gold: "#facc15",
    goldGlow: "rgba(250,204,21,0.3)",
  },
  streak: {
    orange: "#f97316",
    gold: "#eab308",
    purple: "#a855f7",
    rainbow: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"],
  },
  confetti: [mindtabColors.ink, "#22c55e", mindtabColors.violet, mindtabColors.rose, mindtabColors.cyan] as const,
  // Feedback
  feedback: {
    success: "#22c55e",
    successMuted: "rgba(34,197,94,0.15)",
    error: "#ef4444",
    errorMuted: "rgba(239,68,68,0.15)",
    warning: "#fbbf24",
  },
  // Note types
  noteType: {
    article: "#818cf8",
    book: "#f59e0b",
    video: "#ef4444",
    podcast: "#22c55e",
    website: mindtabColors.cyan,
  },

  white: "#ffffff",
  black: "#000000",

  // Legacy flat tokens (for NativeWind/existing component compat)
  background: mindtabColors.bg,
  foreground: mindtabColors.text,
  card: mindtabColors.bgElev,
  borderFlat: mindtabColors.border,
  primary: mindtabColors.ink,
  secondary: mindtabColors.bgSoft,
  muted: mindtabColors.bgSoft,
  mutedForeground: mindtabColors.text2,
  destructive: "#7f1d1d",
  accentFlat: mindtabColors.bgSoft,
} as const;
