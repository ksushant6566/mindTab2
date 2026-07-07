export const TASK_STATUS = ["pending", "in_progress", "completed", "archived"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const TASK_PRIORITY = ["priority_1", "priority_2", "priority_3", "priority_4"] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

export const TASK_IMPACT = ["low", "medium", "high"] as const;
export type TaskImpact = (typeof TASK_IMPACT)[number];

export const NOTE_TYPE = ["article", "book", "video", "podcast", "website"] as const;
export type NoteType = (typeof NOTE_TYPE)[number];

export const PROJECT_STATUS = ["active", "paused", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
