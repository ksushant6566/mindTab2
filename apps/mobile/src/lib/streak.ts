/**
 * Calculate consecutive-day streak from habit tracker records.
 * Tracker is a flat array of { habitId, date, status } records
 * (matching the /habit-tracker API response shape).
 * A streak day = at least one habit completed that day.
 */
export const STREAK_MILESTONES = [7, 14, 30, 60, 90, 100] as const;

export function calculateStreak(tracker: any[]): number {
  if (!tracker || tracker.length === 0) return 0;

  const completedDates = new Set<string>();
  for (const record of tracker) {
    if (record.status === "completed" && record.date) {
      completedDates.add(record.date);
    }
  }

  if (completedDates.size === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let checkDate = new Date(today);

  // If today has no completions, start counting from yesterday
  const todayStr = checkDate.toISOString().split("T")[0];
  if (!completedDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dateStr = checkDate.toISOString().split("T")[0];
    if (completedDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export function checkStreakMilestone(streak: number): number | null {
  return STREAK_MILESTONES.includes(streak as any) ? streak : null;
}
