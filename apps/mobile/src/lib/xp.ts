export const XP_VALUES = {
  HABIT_COMPLETE: 10,
  HABIT_UNCOMPLETE: -10,
  GOAL_COMPLETE: 25,
  GOAL_P1_COMPLETE: 40,
  GOAL_HIGH_IMPACT_COMPLETE: 35,
  NOTE_WRITTEN: 5,
  STREAK_7_DAY: 50,
  STREAK_30_DAY: 200,
  PERFECT_DAY: 15,
  PROJECT_COMPLETE: 100,
} as const;

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000];

export function getLevelForXP(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]!) return i + 1;
  }
  return 1;
}

export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level - 1 < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level - 1]!;
  return Math.round(50 * Math.pow(level - 1, 1.5));
}

export function getXPProgress(xp: number): {
  level: number;
  currentLevelXP: number;
  nextLevelXP: number;
  progress: number;
  xpToNext: number;
} {
  const level = getLevelForXP(xp);
  const currentLevelXP = getXPForLevel(level);
  const nextLevelXP = getXPForLevel(level + 1);
  const range = nextLevelXP - currentLevelXP;
  const progress = range > 0 ? (xp - currentLevelXP) / range : 0;

  return {
    level,
    currentLevelXP,
    nextLevelXP,
    progress: Math.min(Math.max(progress, 0), 1),
    xpToNext: nextLevelXP - xp,
  };
}
