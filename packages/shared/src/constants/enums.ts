export const GOAL_STATUS = ["pending", "in_progress", "completed", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUS)[number];

export const GOAL_PRIORITY = ["priority_1", "priority_2", "priority_3", "priority_4"] as const;
export type GoalPriority = (typeof GOAL_PRIORITY)[number];

export const GOAL_IMPACT = ["low", "medium", "high"] as const;
export type GoalImpact = (typeof GOAL_IMPACT)[number];

export const HABIT_FREQUENCY = ["daily", "weekly"] as const;
export type HabitFrequency = (typeof HABIT_FREQUENCY)[number];

export const HABIT_TRACKER_STATUS = ["pending", "completed"] as const;
export type HabitTrackerStatus = (typeof HABIT_TRACKER_STATUS)[number];

export const JOURNAL_TYPE = ["article", "book", "video", "podcast", "website"] as const;
export type JournalType = (typeof JOURNAL_TYPE)[number];

export const PROJECT_STATUS = ["active", "paused", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
