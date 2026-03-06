export function calculateStreak(tracker: any[]): number {
  if (!tracker || tracker.length === 0) return 0;

  const completedDates = new Set<string>();
  for (const habit of tracker) {
    if (habit.completions) {
      for (const c of habit.completions) {
        completedDates.add(c.date);
      }
    }
  }

  if (completedDates.size === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let checkDate = new Date(today);

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
