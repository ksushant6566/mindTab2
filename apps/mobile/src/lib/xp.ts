/**
 * XP Level System
 * Formula: XP_threshold = 50 * level^1.5 (rounded)
 * Each level takes progressively more effort.
 */

export function getLevelForXP(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.pow(xp / 50, 1 / 1.5)) + 1;
}

export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
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
