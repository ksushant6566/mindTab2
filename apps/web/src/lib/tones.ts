export type PriorityValue = "priority_1" | "priority_2" | "priority_3" | "priority_4";
export type ImpactValue = "low" | "medium" | "high";
export type StatusValue = "pending" | "in_progress" | "completed" | "archived";

export type ToneMeta = {
  label: string;
  tone: string;
};

export const priorityToneMeta: Record<PriorityValue, ToneMeta> = {
  priority_1: { label: "P1", tone: "var(--tone-priority-p1)" },
  priority_2: { label: "P2", tone: "var(--tone-priority-p2)" },
  priority_3: { label: "P3", tone: "var(--tone-priority-p3)" },
  priority_4: { label: "P4", tone: "var(--tone-priority-p4)" },
};

export const impactToneMeta: Record<ImpactValue, ToneMeta & { dots: number }> = {
  low: { label: "Low", dots: 1, tone: "var(--tone-impact-low)" },
  medium: { label: "Medium", dots: 2, tone: "var(--tone-impact-medium)" },
  high: { label: "High", dots: 3, tone: "var(--tone-impact-high)" },
};

export const statusToneMeta: Record<StatusValue, ToneMeta & { background: string }> = {
  pending: {
    label: "To Do",
    tone: "var(--tone-status-todo)",
    background: "color-mix(in srgb, var(--tone-status-todo) 13%, var(--bg-elev))",
  },
  in_progress: {
    label: "In Progress",
    tone: "var(--tone-status-progress)",
    background: "color-mix(in srgb, var(--tone-status-progress) 14%, var(--bg-elev))",
  },
  completed: {
    label: "Done",
    tone: "var(--tone-status-done)",
    background: "color-mix(in srgb, var(--tone-status-done) 14%, var(--bg-elev))",
  },
  archived: {
    label: "Archive",
    tone: "var(--tone-status-archived)",
    background: "var(--bg-soft)",
  },
};

export function getPriorityTone(value?: string | null) {
  return priorityToneMeta[(value as PriorityValue) || "priority_4"] ?? priorityToneMeta.priority_4;
}

export function getImpactTone(value?: string | null) {
  return impactToneMeta[(value as ImpactValue) || "low"] ?? impactToneMeta.low;
}

export function getStatusTone(value?: string | null) {
  return statusToneMeta[(value as StatusValue) || "pending"] ?? statusToneMeta.pending;
}
