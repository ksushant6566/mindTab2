import { Badge } from "~/components/ui/badge";

const statusConfig: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  archived: { label: "Archived", variant: "outline" },
};

export function GoalStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.pending;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
