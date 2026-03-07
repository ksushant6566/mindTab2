export const colors = {
  // Backgrounds
  bg: {
    primary: "#0a0a0a",
    elevated: "#141414",
    surface: "#1c1c1c",
    overlay: "rgba(0,0,0,0.5)",
  },
  // Text
  text: {
    primary: "#fafafa",
    secondary: "#a3a3a3",
    muted: "#737373",
    reader: "#e5e5e5",
  },
  // Borders
  border: {
    default: "#262626",
    subtle: "#1a1a1a",
    focus: "#818cf8",
  },
  // Accent
  accent: {
    indigo: "#818cf8",
    indigoMuted: "rgba(129,140,248,0.15)",
  },
  // Status
  status: {
    pending: "#a3a3a3",
    active: "#60a5fa",
    completed: "#22c55e",
    archived: "#78716c",
    paused: "#fbbf24",
  },
  // Priority
  priority: {
    p1: "#ef4444",
    p2: "#f97316",
    p3: "#60a5fa",
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
  },
  confetti: ["#facc15", "#22c55e", "#818cf8", "#f472b6", "#38bdf8"] as const,
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
    website: "#60a5fa",
  },

  // Legacy flat tokens (for NativeWind/existing component compat)
  background: "#0a0a0a",
  foreground: "#fafafa",
  card: "#141414",
  borderFlat: "#262626",
  primary: "#fafafa",
  secondary: "#262626",
  muted: "#262626",
  mutedForeground: "#a3a3a3",
  destructive: "#7f1d1d",
  accentFlat: "#262626",
} as const;
